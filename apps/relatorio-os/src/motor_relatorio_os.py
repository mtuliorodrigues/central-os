from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv
from rapidfuzz.fuzz import ratio, partial_ratio, token_set_ratio

APP_DIR = Path(__file__).resolve().parent
INSTANCE = os.getenv("EVOLUTION_INSTANCE", "sgp-whatsapp")
MAX_DIAS = 12

CITY_PRIORITY = [
    "CONCEIÇÃO DAS ALAGOAS",
    "CAMPO FLORIDO",
]

MODALITY_PRIORITY = [
    "FIBRA",
    "RÁDIO",
]


# ============================================================
# UTILIDADES
# ============================================================

SYNC_DEBUG_LOG = None


def configure_utf8_stdio():
    """Mantém a saída do processo em UTF-8 mesmo quando o Windows usa cp1252."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            try:
                reconfigure(encoding="utf-8", errors="backslashreplace")
            except (OSError, ValueError):
                pass


def sync_log(msg):
    """
    Registra diagnóstico persistente da segunda busca.
    Também imprime no stdout, mas o arquivo é a fonte principal.
    """
    global SYNC_DEBUG_LOG
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"

    if SYNC_DEBUG_LOG:
        try:
            with open(SYNC_DEBUG_LOG, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass
    try:
        print(line)
    except UnicodeEncodeError:
        stream = getattr(sys, "stdout", None)
        buffer = getattr(stream, "buffer", None)
        if buffer:
            buffer.write((line + "\n").encode("utf-8", errors="backslashreplace"))
            buffer.flush()


def _artifact(path, kind):
    path = Path(path)
    try:
        data = path.read_bytes()
        return {"type": kind, "storageKey": path.name, "sha256": hashlib.sha256(data).hexdigest(), "sizeBytes": len(data), "metadata": {}}
    except OSError:
        return None


def _contract_item(item, status=None, destination_ids=None):
    status = status or str(item.get("MatchStatus") or "unknown").lower().replace("nao encontrada", "not_found").replace("encontrada", "found").replace("revisar", "review")
    if status == "nao encontrada":
        status = "not_found"
    reasons = item.get("MatchMotivos") or []
    if isinstance(reasons, str):
        reasons = [reasons] if reasons else []
    return {
        "rowNumber": int(item.get("rowNumber") or item.get("Linha") or 1),
        "osNumber": clean(item.get("OS", "")),
        "contractId": clean(item.get("Contrato", "") or item.get("ID", "")),
        "clientName": clean(item.get("Cliente", "")),
        "status": status,
        "matchScore": float(item.get("MatchScore") or 0),
        "matchReasons": reasons,
        "messageIdSource": clean(item.get("MessageId", "")),
        "messageIdDestination": (destination_ids or {}).get(clean(item.get("OS", "")), ""),
        "failureCode": clean(item.get("FailureCode", "")),
        "failureMessage": clean(item.get("FailureMessage", "")),
        "reviewRequired": status == "review",
    }


def write_execution_contract(out_dir, execution_id, import_id, source, file_name, started_at, finished_at, status, full_rows, excluded_rows, selected_rows, matched_df, artifacts, sent_count=0, failure_count=0, excluded_by_reason=None, error_summary=None, destination_ids=None):
    if not execution_id:
        return None
    items = []
    for item in excluded_rows:
        item = dict(item)
        item["FailureCode"] = item.get("MotivoExclusao", "excluded")
        items.append(_contract_item(item, "excluded", destination_ids))
    if matched_df is not None and not matched_df.empty:
        items.extend(_contract_item(row.to_dict(), destination_ids=destination_ids) for _, row in matched_df.iterrows())
    contract = {
        "executionId": execution_id,
        "importId": import_id,
        "source": source,
        "fileName": file_name,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "status": status,
        "rowsRead": len(full_rows),
        "excludedCount": len(excluded_rows),
        "excludedByReason": excluded_by_reason or {},
        "eligibleCount": len(selected_rows),
        "foundCount": int((matched_df["MatchStatus"] == "ENCONTRADA").sum()) if matched_df is not None and not matched_df.empty else 0,
        "reviewCount": int((matched_df["MatchStatus"] == "REVISAR").sum()) if matched_df is not None and not matched_df.empty else 0,
        "notFoundCount": int((matched_df["MatchStatus"] == "NAO ENCONTRADA").sum()) if matched_df is not None and not matched_df.empty else 0,
        "sentCount": int(sent_count),
        "skippedCount": 0,
        "failureCount": int(failure_count),
        "items": items,
        "artifacts": [item for item in artifacts if item],
        "errorSummary": error_summary or {},
        "engineVersion": "motor_relatorio_os.py",
    }
    target = Path(out_dir) / f"execution_result_{execution_id}.json"
    target.write_text(json.dumps(contract, ensure_ascii=False, indent=2), encoding="utf-8")
    return contract

def norm(v):
    s = "" if v is None else str(v)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = s.upper().replace("\r", " ").replace("\n", " ")
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()


def digits(v):
    return re.sub(r"\D", "", "" if v is None else str(v))


def clean(v):
    return str(v or "").strip()


def meaningful_content(v):
    n = norm(v)
    return len(n) >= 28 and len(n.split()) >= 5


def contains_number_token(text, number):
    """
    Procura um número como token isolado no texto original.
    Evita o falso positivo causado por juntar todos os dígitos de CPF,
    telefone, endereço e outros campos da mensagem.
    """
    number = digits(number)
    if not number:
        return False

    raw = str(text or "")
    return re.search(rf"(?<!\d){re.escape(number)}(?!\d)", raw) is not None


def contains_labeled_id(text, number):
    """
    Procura contrato/ID em contexto explícito de identificação.
    Evita aceitar o mesmo número aparecendo por acaso dentro de telefone/CPF.
    """
    number = digits(number)
    if not number:
        return False

    raw = str(text or "")
    normalized = norm(raw)

    patterns = [
        rf"(?:^| )ID ?{re.escape(number)}(?: |$)",
        rf"(?:^| )CLIENTE ID ?{re.escape(number)}(?: |$)",
        rf"(?:^| )CONTRATO ID ?{re.escape(number)}(?: |$)",
    ]

    if any(re.search(p, normalized) for p in patterns):
        return True

    for line in raw.splitlines():
        if "🆔" in line and contains_number_token(line, number):
            return True

    return False


def parse_criada(v):
    s = clean(v)
    if not s:
        return None

    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass

    ts = pd.to_datetime(s, dayfirst=True, errors="coerce")
    if pd.isna(ts):
        return None
    return ts.to_pydatetime()


def age_days(row, ref_date=None):
    dt = parse_criada(row.get("Criada", ""))
    if dt is None:
        return None
    ref = ref_date or datetime.now().date()
    return (ref - dt.date()).days


# ============================================================
# REGRAS DA PLANILHA
# ============================================================

def has_os(row):
    return bool(clean(row.get("OS", "")))


def is_retirada(row):
    return norm(row.get("Tipo", "")) == "RETIRADA"


def contains_algar(row):
    return any("ALGAR" in norm(v) for v in row.values)


def is_sousa_ramos(row):
    for v in row.values:
        n = norm(v)
        if "SOUSA RAMOS" in n or "SOUSA E RAMOS" in n:
            return True
    return False


def is_financeiro(row):
    return norm(row.get("Tipo", "")).startswith("FINANCEIRO")


def is_infra(row):
    """Exclui somente a classificação estrutural exata INFRA."""
    return norm(row.get("Tipo", "")) == "INFRA"


def exclusion_reason(row, ref_date=None):
    if not has_os(row):
        return "SEM OS"
    if is_retirada(row):
        return "RETIRADA"
    if contains_algar(row):
        return "ALGAR"
    if is_sousa_ramos(row):
        return "SOUSA & RAMOS"
    if is_financeiro(row):
        return "FINANCEIRO"
    if is_infra(row):
        return "INFRA"

    dias = age_days(row, ref_date=ref_date)
    if dias is not None and dias > MAX_DIAS:
        return f"MAIS DE {MAX_DIAS} DIAS"

    return ""


# ============================================================
# LEITURA DA PLANILHA
# ============================================================

def read_one(path: Path):
    suffix = path.suffix.lower()

    if suffix == ".csv":
        try:
            return pd.read_csv(path, sep=";", dtype=str, encoding="utf-8").fillna("")
        except UnicodeDecodeError:
            return pd.read_csv(path, sep=";", dtype=str, encoding="latin-1").fillna("")

    if suffix == ".xlsx":
        return pd.read_excel(path, dtype=str).fillna("")

    raise RuntimeError(f"Formato não suportado: {path.name}")


def read_files(path: Path):
    if path.is_dir():
        files = sorted([*path.glob("*.csv"), *path.glob("*.xlsx")])
    else:
        files = [path]

    files = [f for f in files if f.exists()]
    if not files:
        raise RuntimeError("Nenhuma planilha CSV/XLSX encontrada.")

    frames = []
    for f in files:
        df = read_one(f)
        df["_arquivo"] = f.name
        df["_linha"] = range(2, len(df) + 2)
        frames.append(df)

    full = pd.concat(frames, ignore_index=True)
    return files, full, dedupe(full)


def dedupe(df: pd.DataFrame):
    if "OS" not in df.columns:
        return df.drop_duplicates().reset_index(drop=True)

    d = df.copy()
    os_clean = d["OS"].astype(str).str.strip()

    filled = d[os_clean != ""].drop_duplicates(subset=["OS"], keep="first").copy()
    blank = d[os_clean == ""].copy()

    if not blank.empty:
        blank["_blank_key"] = blank.apply(
            lambda r: "|".join([
                digits(r.get("CPF/CNPJ", "")),
                digits(r.get("Contrato", "")),
                norm(r.get("Cliente", "")),
                norm(r.get("Criada", "")),
                norm(r.get("Conteúdo", "")),
            ]),
            axis=1,
        )
        blank = blank.drop_duplicates(subset=["_blank_key"], keep="first")
        blank = blank.drop(columns=["_blank_key"])

    return pd.concat([filled, blank], ignore_index=True).reset_index(drop=True)


# ============================================================
# CIDADE / MODALIDADE / ORDEM
# ============================================================

def city(row):
    p = norm(row.get("POP", ""))

    if "IMPORTACAO RADIUSNET" in p:
        return "UBERABA"

    aliases = {
        "CONCEICAO DAS ALAGOAS": "CONCEIÇÃO DAS ALAGOAS",
        "CAMPO FLORIDO": "CAMPO FLORIDO",
        "PRATA MG": "PRATA",
        "PRATA": "PRATA",
        "VERISSIMO": "VERÍSSIMO",
        "PIRAJUBA": "PIRAJUBA",
        "MIGUELOPOLIS": "MIGUELÓPOLIS",
        "UBERABA": "UBERABA",
    }
    return aliases.get(p, clean(row.get("POP", "")).upper() or "SEM CIDADE")


def modality(row, matched_text=""):
    p = norm(row.get("POP", ""))
    b = norm(row.get("Bairro", ""))
    c = norm(row.get("Conteúdo", ""))
    m = norm(matched_text)
    alltxt = f" {p} {b} {c} {m} "

    if "IMPORTACAO RADIUSNET" in p:
        return "RÁDIO"

    radio_terms = (
        " TORRE ", " ANTENA ", " UBIQUITI ", " MIKROTIK ",
        " PLAY 09 ", " PLAY 15 ", " PLAY 44 ", " DBM ",
        " RADIO ", " RURAL ",
    )
    fiber_terms = (
        " FIBRA ", " ONU ", " ONT ", " GPON ", " EPON ",
        " LOS ", " DROP ", " FUSAO ",
    )

    rr = sum(x in alltxt for x in radio_terms)
    ff = sum(x in alltxt for x in fiber_terms)

    if rr > ff and rr:
        return "RÁDIO"
    if ff > rr and ff:
        return "FIBRA"
    if "ZONA RURAL" in b or b == "RURAL":
        return "RÁDIO"

    return "FIBRA"


def ordered_groups(selected: pd.DataFrame):
    if selected.empty:
        return []

    records = selected.to_dict("records")

    seen_cities = []
    for item in records:
        cid = item["Cidade"]
        if cid not in seen_cities:
            seen_cities.append(cid)

    city_order = [c for c in CITY_PRIORITY if c in seen_cities]
    city_order += [c for c in seen_cities if c not in city_order]

    groups = []
    for cid in city_order:
        city_items = [x for x in records if x["Cidade"] == cid]

        present_mods = []
        for item in city_items:
            mod = item["Modalidade"]
            if mod not in present_mods:
                present_mods.append(mod)

        mod_order = [m for m in MODALITY_PRIORITY if m in present_mods]
        mod_order += [m for m in present_mods if m not in mod_order]

        for mod in mod_order:
            items = [x for x in city_items if x["Modalidade"] == mod]
            if items:
                groups.append((cid, mod, items))

    return groups


# ============================================================
# EVOLUTION / WHATSAPP
# ============================================================

def evolution():
    env_file = Path(os.getenv("RELATORIO_ENV_FILE") or (APP_DIR.parent / ".env"))
    load_dotenv(env_file)

    key = os.getenv("AUTHENTICATION_API_KEY")
    if not key:
        raise RuntimeError("AUTHENTICATION_API_KEY não encontrada no .env.")

    base = os.getenv("EVOLUTION_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    instance = os.getenv("EVOLUTION_INSTANCE", "sgp-whatsapp")

    headers = {
        "apikey": key,
        "Content-Type": "application/json",
    }
    return base, instance, headers


def fetch_all_messages(base, instance, headers, group_id, page_size=100):
    records = []
    page = 1

    while True:
        payload = {
            "where": {
                "key": {
                    "remoteJid": group_id
                }
            },
            "page": page,
            "offset": page_size,
        }

        r = requests.post(
            f"{base}/chat/findMessages/{instance}",
            headers=headers,
            json=payload,
            timeout=60,
        )
        r.raise_for_status()

        raw = r.json()
        data = raw.get("messages", raw)

        if isinstance(data, dict):
            page_records = data.get("records") or data.get("data") or []
            pages = int(data.get("pages") or 1)
        elif isinstance(data, list):
            page_records = data
            pages = 1
        else:
            page_records = []
            pages = 1

        records.extend(page_records)

        print(f"HISTORICO {page}/{pages} | {len(records)} mensagens")

        if page >= pages:
            break

        page += 1

    return records


def get_texts(message):
    """
    Extrai somente o texto próprio da mensagem, inclusive quando o WhatsApp
    encapsula o conteúdo em estruturas de edição/protocolo.
    Não entra em quotedMessage para evitar casar com uma mensagem apenas citada.
    """
    out = []
    seen = set()

    def add_text(value):
        if not isinstance(value, str):
            return
        value = value.strip()
        if value and value not in seen:
            seen.add(value)
            out.append(value)

    def walk(obj, parent_key=""):
        if isinstance(obj, list):
            for item in obj:
                walk(item, parent_key)
            return

        if not isinstance(obj, dict):
            return

        # Não usar texto de mensagem citada para o casamento.
        if parent_key == "quotedMessage":
            return

        conv = obj.get("conversation")
        add_text(conv)

        ext = obj.get("extendedTextMessage")
        if isinstance(ext, dict):
            add_text(ext.get("text"))

        for key in ("imageMessage", "videoMessage", "documentMessage"):
            media = obj.get(key)
            if isinstance(media, dict):
                add_text(media.get("caption"))

        # Mensagens editadas costumam vir encapsuladas em protocolMessage
        # (editedMessage) ou em wrappers equivalentes.
        protocol = obj.get("protocolMessage")
        if isinstance(protocol, dict):
            edited = protocol.get("editedMessage")
            if isinstance(edited, dict):
                walk(edited, "editedMessage")

        edited = obj.get("editedMessage")
        if isinstance(edited, dict):
            walk(edited, "editedMessage")

        # Alguns wrappers do WhatsApp/Baileys aninham a mensagem real.
        for key in (
            "ephemeralMessage",
            "viewOnceMessage",
            "viewOnceMessageV2",
            "viewOnceMessageV2Extension",
            "documentWithCaptionMessage",
            "deviceSentMessage",
        ):
            wrapper = obj.get(key)
            if isinstance(wrapper, dict):
                inner = wrapper.get("message")
                if isinstance(inner, dict):
                    walk(inner, key)

    walk(message)
    return out


def own_text(record):
    return "\n".join(get_texts(record.get("message") or {})).strip()


def media_kind(record):
    msg = record.get("message") or {}

    if "imageMessage" in msg:
        return "IMAGEM"
    if "videoMessage" in msg:
        return "VIDEO"
    if "documentMessage" in msg:
        return "DOCUMENTO"
    if "audioMessage" in msg:
        return "AUDIO"
    if "locationMessage" in msg or "liveLocationMessage" in msg:
        return "LOCALIZACAO"
    if own_text(record):
        return "TEXTO"

    return str(record.get("messageType") or "OUTRO").upper()


# ============================================================
# MATCH PLANILHA -> MENSAGEM DO GRUPO DE ORIGEM
# ============================================================

def request_history_sync(base, instance, headers, anchor_record, count=50):
    """
    Pede ao Baileys uma sincronização sob demanda e registra a resposta completa.
    """
    key = (anchor_record or {}).get("key") or {}
    msg_id = key.get("id")
    remote_jid = key.get("remoteJid")
    ts = (anchor_record or {}).get("messageTimestamp")

    sync_log(
        f"Preparando sync | anchor_id={msg_id} | remoteJid={remote_jid} | timestamp={ts}"
    )

    if not msg_id or not remote_jid or not ts:
        sync_log("SYNC CANCELADO: âncora incompleta.")
        return False, "âncora incompleta"

    payload = {
        "key": {
            "id": msg_id,
            "remoteJid": remote_jid,
            "fromMe": bool(key.get("fromMe", False)),
        },
        "messageTimestamp": ts,
        "count": min(50, max(1, int(count))),
    }

    if key.get("participant"):
        payload["key"]["participant"] = key["participant"]

    try:
        url = f"{base}/chat/syncHistory/{instance}"
        sync_log(f"POST {url}")
        r = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=30,
        )

        body = (r.text or "")[:3000].replace("\n", " ")
        sync_log(f"SYNC HTTP {r.status_code} | resposta={body}")

        if r.status_code == 404:
            return False, "rota syncHistory não instalada"

        r.raise_for_status()
        return True, ""

    except Exception as e:
        sync_log(f"ERRO NA REQUISIÇÃO DE SYNC: {type(e).__name__}: {e}")
        return False, str(e)



def choose_history_anchor(records, row):
    """
    Escolhe uma mensagem do grupo próxima da criação da OS.
    O fetchMessageHistory busca mensagens anteriores à âncora.
    """
    created = parse_criada(row.get("Criada", ""))
    timed = []

    for rec in records:
        dt = record_timestamp(rec)
        if dt is None:
            continue

        if dt.tzinfo is not None:
            dt_cmp = dt.astimezone().replace(tzinfo=None)
        else:
            dt_cmp = dt

        timed.append((dt_cmp, rec))

    if not timed:
        return None

    timed.sort(key=lambda x: x[0])

    if created is not None:
        after = [(dt, rec) for dt, rec in timed if dt >= created]
        if after:
            return min(after, key=lambda x: (x[0] - created).total_seconds())[1]
        return min(timed, key=lambda x: abs((x[0] - created).total_seconds()))[1]

    return timed[-1][1]


def refresh_history_for_unmatched(base, instance, headers, group_id, selected, matches, records):
    """
    Segunda tentativa para itens pendentes com diagnóstico persistente.
    """
    pending = [x for x in matches if x.get("MatchStatus") != "ENCONTRADA"]

    sync_log(f"PRIMEIRA BUSCA: {len(records)} mensagens recebidas da Evolution.")
    sync_log(f"PENDENTES APÓS PRIMEIRO MATCHING: {len(pending)}")

    if not pending:
        sync_log("Nenhuma pendência. Segunda busca não é necessária.")
        return matches, records

    sync_log("INICIANDO SEGUNDA BUSCA / SINCRONIZAÇÃO DE HISTÓRICO.")

    requested = 0
    seen_anchors = set()

    for item in pending:
        osnum = clean(item.get("OS", ""))
        cliente = clean(item.get("Cliente", ""))
        contrato = clean(item.get("Contrato", ""))
        criada = clean(item.get("Criada", ""))

        sync_log(
            f"PENDENTE | OS={osnum} | cliente={cliente} | ID={contrato} | criada={criada} "
            f"| score={item.get('MatchScore')} | motivos={item.get('MatchMotivos')}"
        )

        anchor = choose_history_anchor(records, item)

        if not anchor:
            sync_log(f"SEM ÂNCORA | OS={osnum}")
            continue

        anchor_key = anchor.get("key") or {}
        anchor_id = anchor_key.get("id") or ""
        anchor_ts = anchor.get("messageTimestamp")
        anchor_text = own_text(anchor).replace("\n", " | ")[:500]

        sync_log(
            f"ÂNCORA | OS={osnum} | id={anchor_id} | timestamp={anchor_ts} | texto={anchor_text}"
        )

        if not anchor_id:
            sync_log(f"ÂNCORA SEM ID | OS={osnum}")
            continue

        if anchor_id in seen_anchors:
            sync_log(f"ÂNCORA JÁ UTILIZADA | OS={osnum} | id={anchor_id}")
            continue

        seen_anchors.add(anchor_id)

        ok, err = request_history_sync(base, instance, headers, anchor, count=50)

        if ok:
            requested += 1
            sync_log(f"SYNC SOLICITADO COM SUCESSO | OS={osnum}")
        else:
            sync_log(f"SYNC FALHOU | OS={osnum} | motivo={err}")
            if "não instalada" in err:
                sync_log("A rota syncHistory não está instalada. Interrompendo novas tentativas.")
                break

        time.sleep(0.8)

    sync_log(f"TOTAL DE SOLICITAÇÕES DE SYNC ACEITAS: {requested}")

    if requested == 0:
        sync_log("Nenhuma sincronização foi aceita. Mantendo resultado da primeira busca.")
        return matches, records

    sync_log("AGUARDANDO 7 SEGUNDOS PARA O WHATSAPP ENTREGAR/PERSISTIR O HISTÓRICO...")
    time.sleep(7)

    try:
        refreshed = fetch_all_messages(
            base, instance, headers, group_id, page_size=100
        )
    except Exception as e:
        sync_log(f"ERRO AO RELER HISTÓRICO: {type(e).__name__}: {e}")
        return matches, records

    sync_log(
        f"HISTÓRICO APÓS SYNC: antes={len(records)} | depois={len(refreshed)}"
    )

    new_matches = build_matches(selected, refreshed)
    new_pending = [x for x in new_matches if x.get("MatchStatus") != "ENCONTRADA"]

    sync_log(
        f"PENDENTES APÓS SEGUNDA BUSCA: {len(new_pending)}"
    )

    # Log específico das pendências finais.
    for item in new_pending:
        sync_log(
            f"AINDA PENDENTE | OS={clean(item.get('OS',''))} | "
            f"cliente={clean(item.get('Cliente',''))} | "
            f"score={item.get('MatchScore')} | motivos={item.get('MatchMotivos')} | "
            f"candidata={clean(item.get('MensagemEncontrada',''))[:500]}"
        )

    return new_matches, refreshed



def score_message(row, text):
    nt = norm(text)

    osnum = digits(row.get("OS", ""))
    contrato = digits(row.get("Contrato", ""))
    cpf = digits(row.get("CPF/CNPJ", ""))
    nome = norm(row.get("Cliente", ""))
    conteudo = norm(row.get("Conteúdo", ""))

    score = 0
    reasons = []

    # OS é a informação principal quando aparece como número isolado.
    if osnum and contains_number_token(text, osnum):
        score += 80
        reasons.append("OS")

    # Contrato/ID também precisa aparecer como número isolado.
    if contrato and len(contrato) >= 2 and contains_labeled_id(text, contrato):
        score += 42
        reasons.append("CONTRATO")

    # CPF/CNPJ pode estar formatado com pontos, barra e hífen; por isso aqui
    # comparamos a sequência normalizada de dígitos.
    if cpf and len(cpf) >= 8 and cpf in digits(text):
        score += 42
        reasons.append("CPF")

    if nome:
        nr = token_set_ratio(nome, nt)
        if nr >= 95:
            score += 40
            reasons.append(f"NOME:{nr:.0f}")
        elif nr >= 87:
            score += 30
            reasons.append(f"NOME:{nr:.0f}")
        elif nr >= 78:
            score += 18
            reasons.append(f"NOME:{nr:.0f}")

    if meaningful_content(conteudo):
        cr = max(ratio(conteudo, nt), partial_ratio(conteudo, nt))
        if cr >= 90:
            score += 45
            reasons.append(f"CONTEUDO:{cr:.0f}")
        elif cr >= 75:
            score += 30
            reasons.append(f"CONTEUDO:{cr:.0f}")
        elif cr >= 60:
            score += 16
            reasons.append(f"CONTEUDO:{cr:.0f}")

    return score, ", ".join(reasons)


def record_timestamp(record):
    raw = (
        record.get("messageTimestamp")
        or record.get("timestamp")
        or record.get("createdAt")
        or 0
    )

    try:
        if isinstance(raw, str) and raw.isdigit():
            raw = int(raw)

        if isinstance(raw, (int, float)):
            # WA normalmente usa segundos.
            if raw > 10_000_000_000:
                raw = raw / 1000
            return datetime.fromtimestamp(raw, tz=timezone.utc)
    except Exception:
        pass

    try:
        dt = pd.to_datetime(raw, utc=True, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.to_pydatetime()
    except Exception:
        return None


def build_matches(selected: pd.DataFrame, records):
    candidates = []
    for rec in records:
        txt = own_text(rec)
        if txt:
            candidates.append((rec, txt))

    used = set()
    results = []

    for idx, row in selected.iterrows():
        ranked = []

        for rec, txt in candidates:
            key = (rec.get("key") or {}).get("id") or id(rec)
            if key in used:
                continue

            sc, why = score_message(row, txt)
            if sc > 0:
                ranked.append((sc, rec, txt, why))

        ranked.sort(key=lambda x: x[0], reverse=True)
        best = ranked[0] if ranked else None
        second = ranked[1][0] if len(ranked) > 1 else 0

        status = "NAO ENCONTRADA"
        score = 0
        why = ""
        rec = None
        txt = ""

        if best:
            score, rec, txt, why = best
            gap = score - second

            # Segurança prática: uma pontuação alta não resolve empate entre
            # mensagens diferentes. Exige também vantagem clara sobre a
            # segunda candidata antes de liberar o encaminhamento automático.
            if score >= 70 and gap >= 8:
                status = "ENCONTRADA"
                used.add((rec.get("key") or {}).get("id") or id(rec))
            elif score >= 55:
                status = "REVISAR"
            else:
                status = "NAO ENCONTRADA"

        item = row.to_dict()
        item["MatchStatus"] = status
        item["MatchScore"] = score
        item["MatchMotivos"] = why
        item["MensagemEncontrada"] = txt
        item["_record"] = rec
        item["TipoMensagem"] = media_kind(rec) if rec else ""
        item["MessageId"] = ((rec or {}).get("key") or {}).get("id", "")

        results.append(item)

    return results


# ============================================================
# ENCAMINHAMENTO NATIVO DA MENSAGEM ORIGINAL
# ============================================================

def send_text(base, instance, headers, destination, text):
    """Usado somente para os cabeçalhos e para *Fim*."""
    r = requests.post(
        f"{base}/message/sendText/{instance}",
        headers=headers,
        json={"number": destination, "text": text},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def forward_original_record(base, instance, headers, destination, record):
    """
    Encaminha a WAMessage original pelo endpoint local adicionado à Evolution.
    Não recria texto e não baixa/reenvia mídia.
    """
    if not isinstance(record, dict) or not record.get("message"):
        raise RuntimeError("Mensagem original inválida para encaminhamento.")

    payload = {
        "number": destination,
        "message": record,
        "forceForward": True,
    }

    r = requests.post(
        f"{base}/message/forwardMessage/{instance}",
        headers=headers,
        json=payload,
        timeout=120,
    )

    if r.status_code == 404:
        raise RuntimeError(
            "O encaminhamento nativo não está disponível na Evolution em execução. "
            "Verifique se a instância usa a imagem aprovada e se a rota forwardMessage está instalada."
        )

    r.raise_for_status()
    result = r.json()
    sent_key = result.get("key") if isinstance(result, dict) else None
    if not isinstance(sent_key, dict) or not sent_key.get("id"):
        raise RuntimeError("A Evolution não confirmou o ID da mensagem encaminhada.")
    if sent_key.get("remoteJid") != destination:
        raise RuntimeError("A Evolution confirmou o encaminhamento em um destino diferente.")
    return result


def check_native_forward_endpoint(base, instance, headers):
    """
    404 = rota ausente.
    400/422 = rota existe, mas o payload vazio foi rejeitado.
    """
    try:
        r = requests.post(
            f"{base}/message/forwardMessage/{instance}",
            headers=headers,
            json={},
            timeout=10,
        )
        return r.status_code != 404
    except requests.RequestException:
        return False


# ============================================================
# EXECUÇÃO
# ============================================================

def main():
    configure_utf8_stdio()
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada", nargs="?", default="entrada")
    ap.add_argument("--grupo-origem", required=True)
    ap.add_argument("--grupo-destino", required=True)
    ap.add_argument("--saida", default="saida")
    ap.add_argument("--executar", action="store_true")
    ap.add_argument("--execution-id", default="")
    ap.add_argument("--import-id", default="")
    ap.add_argument("--source", default="ui")
    args = ap.parse_args()
    started_at = datetime.now(timezone.utc).isoformat()

    inp = Path(args.entrada)
    if not inp.is_absolute():
        inp = APP_DIR / inp

    out_dir = Path(args.saida)
    if not out_dir.is_absolute():
        out_dir = APP_DIR / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    global SYNC_DEBUG_LOG
    SYNC_DEBUG_LOG = out_dir / f"sync_historico_debug_{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
    sync_log("INÍCIO DO DIAGNÓSTICO DE SINCRONIZAÇÃO.")
    sync_log(f"Motor: {Path(__file__).resolve()}")
    sync_log(f"Grupo de origem: {args.grupo_origem}")

    files, full, df = read_files(inp)
    ref_date = datetime.now().date()

    selected_rows = []
    excluded_rows = []

    for _, row in df.iterrows():
        item = row.to_dict()
        item["Cidade"] = city(row)
        item["Modalidade"] = modality(row)
        item["DiasDesdeCriacao"] = age_days(row, ref_date)

        reason = exclusion_reason(row, ref_date)
        if reason:
            item["MotivoExclusao"] = reason
            excluded_rows.append(item)
        else:
            item["MotivoExclusao"] = ""
            selected_rows.append(item)

    selected = pd.DataFrame(selected_rows)
    excluded = pd.DataFrame(excluded_rows)

    base, instance, headers = evolution()

    print("BUSCANDO MENSAGENS NO GRUPO DE ORIGEM...")
    records = fetch_all_messages(
        base, instance, headers, args.grupo_origem
    )

    matches = build_matches(selected, records)

    # Segunda tentativa para OS que não apareceram no histórico local.
    matches, records = refresh_history_for_unmatched(
        base, instance, headers,
        args.grupo_origem, selected, matches, records
    )

    matched_df = pd.DataFrame([
        {k: v for k, v in x.items() if k != "_record"}
        for x in matches
    ])

    # Ajusta modalidade também com o texto encontrado.
    if not matched_df.empty:
        matched_df["Modalidade"] = [
            modality(row, row.get("MensagemEncontrada", ""))
            for _, row in matched_df.iterrows()
        ]

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    preview_csv = out_dir / f"relatorio_previa_{stamp}.csv"
    excluded_csv = out_dir / f"relatorio_excluidos_{stamp}.csv"
    missing_csv = out_dir / f"relatorio_nao_encontradas_{stamp}.csv"
    preview_txt = out_dir / f"relatorio_previa_{stamp}.txt"

    matched_df.to_csv(preview_csv, sep=";", index=False, encoding="utf-8-sig")
    excluded.to_csv(excluded_csv, sep=";", index=False, encoding="utf-8-sig")

    not_found = matched_df[matched_df["MatchStatus"] != "ENCONTRADA"].copy() if not matched_df.empty else pd.DataFrame()
    not_found.to_csv(missing_csv, sep=";", index=False, encoding="utf-8-sig")

    found_count = int((matched_df["MatchStatus"] == "ENCONTRADA").sum()) if not matched_df.empty else 0
    review_count = int((matched_df["MatchStatus"] == "REVISAR").sum()) if not matched_df.empty else 0
    missing_count = int((matched_df["MatchStatus"] == "NAO ENCONTRADA").sum()) if not matched_df.empty else 0
    excluded_by_reason = {}
    for item in excluded_rows:
        reason = clean(item.get("MotivoExclusao", "excluded")) or "excluded"
        excluded_by_reason[reason] = excluded_by_reason.get(reason, 0) + 1

    print()
    print("=== RELATORIO DE OS ===")
    print(f"Planilha(s) lida(s): {len(files)}")
    print(f"Linhas recebidas: {len(full)}")
    print(f"OS apos filtros: {len(selected)}")
    print(f"Excluidas: {len(excluded)}")
    print(f"Encontradas no grupo: {found_count}")
    print(f"Revisar: {review_count}")
    print(f"Nao encontradas: {missing_count}")
    print()

    lines = [
        "PRÉVIA DO RELATÓRIO DE OS",
        "",
        f"OS após filtros: {len(selected)}",
        f"Encontradas no grupo de origem: {found_count}",
        f"Revisar: {review_count}",
        f"Não encontradas: {missing_count}",
        "",
    ]

    groups = ordered_groups(matched_df)

    for cid, mod, items in groups:
        lines.append(f"===== SERVIÇOS {cid} {mod} =====")
        for item in items:
            lines.append(
                f"[{item.get('MatchStatus')}] "
                f"OS {item.get('OS', '')} | "
                f"{item.get('Cliente', '')} | "
                f"score {item.get('MatchScore', '')}"
            )
            if item.get("MensagemEncontrada"):
                lines.append(item["MensagemEncontrada"])
            lines.append("")

    preview_txt.write_text("\n".join(lines), encoding="utf-8")

    if not args.executar:
        artifacts = [
            _artifact(preview_csv, "preview"),
            _artifact(excluded_csv, "excluded"),
            _artifact(missing_csv, "not_found"),
            _artifact(preview_txt, "execution")
        ]
        write_execution_contract(out_dir, args.execution_id, args.import_id, args.source, inp.name, started_at, datetime.now(timezone.utc).isoformat(), "completed", full, excluded_rows, selected_rows, matched_df, artifacts, excluded_by_reason=excluded_by_reason)
        print("ANALISE CONCLUIDA. NADA FOI ENVIADO.")
        print(f"Previa: {preview_txt}")
        return

    # Envio real: só envia matches confirmados.
    match_by_os = {}
    for item in matches:
        osnum = clean(item.get("OS", ""))
        if osnum:
            match_by_os[osnum] = item

    log = []

    print("=== ENVIO REAL ===")

    if not check_native_forward_endpoint(base, instance, headers):
        raise RuntimeError(
            "Encaminhamento nativo não disponível na Evolution. "
            "Verifique se a instância usa a imagem aprovada e se a rota forwardMessage está instalada."
        )

    for cid, mod, items in groups:
        confirmed = [
            item for item in items
            if item.get("MatchStatus") == "ENCONTRADA"
        ]
        if not confirmed:
            continue

        header = f"*SERVIÇOS {cid} {mod}*"

        try:
            header_result = send_text(base, instance, headers, args.grupo_destino, header)
            log.append({
                "Tipo": "CABECALHO",
                "Cidade": cid,
                "Modalidade": mod,
                "OS": "",
                "Cliente": "",
                "Resultado": "OK",
                "MessageIdDestino": ((header_result or {}).get("key") or {}).get("id", ""),
                "Erro": "",
            })
            print(f"OK | {header}")
        except Exception as e:
            log.append({
                "Tipo": "CABECALHO",
                "Cidade": cid,
                "Modalidade": mod,
                "OS": "",
                "Cliente": "",
                "Resultado": "ERRO",
                "Erro": str(e),
            })
            print(f"ERRO | {header} | {e}")
            continue

        time.sleep(0.7)

        for item in confirmed:
            osnum = clean(item.get("OS", ""))
            cliente = clean(item.get("Cliente", ""))

            original = match_by_os.get(osnum)
            record = original.get("_record") if original else None

            if not record:
                log.append({
                    "Tipo": "OS",
                    "Cidade": cid,
                    "Modalidade": mod,
                    "OS": osnum,
                    "Cliente": cliente,
                    "Resultado": "ERRO",
                    "Erro": "Registro original não disponível.",
                })
                continue

            try:
                forwarded = forward_original_record(
                    base, instance, headers,
                    args.grupo_destino, record
                )
                log.append({
                    "Tipo": "OS",
                    "Cidade": cid,
                    "Modalidade": mod,
                    "OS": osnum,
                    "Cliente": cliente,
                    "Resultado": "OK",
                    "MessageIdDestino": ((forwarded or {}).get("key") or {}).get("id", ""),
                    "Erro": "",
                })
                print(f"OK | OS {osnum} | {cliente} | ID destino {((forwarded or {}).get('key') or {}).get('id', '')}")
            except Exception as e:
                log.append({
                    "Tipo": "OS",
                    "Cidade": cid,
                    "Modalidade": mod,
                    "OS": osnum,
                    "Cliente": cliente,
                    "Resultado": "ERRO",
                    "Erro": str(e),
                })
                print(f"ERRO | OS {osnum} | {cliente} | {e}")

            time.sleep(0.7)

    try:
        end_result = send_text(base, instance, headers, args.grupo_destino, "*Fim*")
        log.append({
            "Tipo": "FIM",
            "Cidade": "",
            "Modalidade": "",
            "OS": "",
            "Cliente": "",
            "Resultado": "OK",
            "MessageIdDestino": ((end_result or {}).get("key") or {}).get("id", ""),
            "Erro": "",
        })
    except Exception as e:
        log.append({
            "Tipo": "FIM",
            "Cidade": "",
            "Modalidade": "",
            "OS": "",
            "Cliente": "",
            "Resultado": "ERRO",
            "Erro": str(e),
        })

    log_path = out_dir / f"relatorio_envio_{stamp}.csv"
    pd.DataFrame(log).to_csv(log_path, sep=";", index=False, encoding="utf-8-sig")

    ok = sum(1 for x in log if x["Tipo"] == "OS" and x["Resultado"] == "OK")
    err = sum(1 for x in log if x["Tipo"] == "OS" and x["Resultado"] == "ERRO")

    print()
    print(f"ENVIO CONCLUIDO | {ok} OS enviadas | {err} erro(s)")
    print(f"Log: {log_path}")

    destination_ids = {clean(item.get("OS", "")): clean(item.get("MessageIdDestino", "")) for item in log if item.get("Tipo") == "OS"}
    artifacts = [
        _artifact(preview_csv, "preview"),
        _artifact(excluded_csv, "excluded"),
        _artifact(missing_csv, "not_found"),
        _artifact(preview_txt, "execution"),
        _artifact(log_path, "sent")
    ]
    write_execution_contract(out_dir, args.execution_id, args.import_id, args.source, inp.name, started_at, datetime.now(timezone.utc).isoformat(), "completed_with_errors" if err else "completed", full, excluded_rows, selected_rows, matched_df, artifacts, sent_count=ok, failure_count=err, excluded_by_reason=excluded_by_reason, destination_ids=destination_ids)


if __name__ == "__main__":
    main()
