
from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
import time
import unicodedata
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent
APP_ROOT = Path(os.getenv("CENTRAL_OS_ROOT") or APP_DIR.parents[2]).resolve()
PASTA_PLANILHAS = Path(os.getenv("RELATORIO_PLANILHAS_DIR") or (APP_ROOT / "data" / "planilhas")).resolve()
PASTA_RECEBIDAS = PASTA_PLANILHAS / "recebidas"
CONFIG_GRUPOS = Path(os.getenv("RELATORIO_GROUPS_FILE") or (APP_DIR.parent / "config" / "grupos_relatorio_os.json")).resolve()
ARQ_USUARIOS_RELATORIO = Path(os.getenv("RELATORIO_USERS_FILE") or (APP_DIR.parent / "config" / "usuarios_relatorio.json")).resolve()
LOG_DIR = Path(os.getenv("RELATORIO_LISTENER_LOG_DIR") or (APP_ROOT / "logs" / "relatorio-os" / "listener")).resolve()
MOTOR = Path(os.getenv("RELATORIO_MOTOR") or (APP_DIR / "motor_relatorio_os.py")).resolve()
OUTPUT_DIR = Path(os.getenv("RELATORIO_OUTPUT_DIR") or (APP_ROOT / "data" / "relatorio-os" / "saida")).resolve()
RELATORIO_ENV_FILE = Path(os.getenv("RELATORIO_ENV_FILE") or (APP_DIR.parent / ".env")).resolve()

COMANDO_LOCAL = "!relatorio local"
COMANDO_PLANILHA = "!relatorio planilha"
COMANDO_AQUI = "!relatorio aqui"
COMANDO_ANTIGO = "!relatorio"  # compatibilidade: equivale a LOCAL
COMANDO_REGISTRAR = "!relatório registrar"

# Comando paralelo e independente do relatório.
CONTATO_TEAMO = os.getenv("RELATORIO_TEAMO_CONTATO", "").strip()
COMANDOS_TEAMO = ("!teamo", "!te amo")
MENSAGEM_TEAMO = os.getenv("RELATORIO_TEAMO_MENSAGEM", "Eu te amo muito meu amor, você é minha vida, meu tudo <3")
INTERVALO = 4
JANELA_ANEXO_SEGUNDOS = 10 * 60
MAX_RECENTES = 150


def norm_cmd(text: str) -> str:
    s = (text or "").strip().casefold()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s)


def unwrap_message(message):
    """Remove alguns envelopes comuns do WhatsApp."""
    cur = message if isinstance(message, dict) else {}
    changed = True
    while changed:
        changed = False
        for key in (
            "ephemeralMessage",
            "viewOnceMessage",
            "viewOnceMessageV2",
            "documentWithCaptionMessage",
        ):
            part = cur.get(key)
            if isinstance(part, dict) and isinstance(part.get("message"), dict):
                cur = part["message"]
                changed = True
                break
    return cur


def own_text(record):
    msg = unwrap_message(record.get("message") or {})

    if isinstance(msg.get("conversation"), str):
        return msg["conversation"].strip()

    ext = msg.get("extendedTextMessage")
    if isinstance(ext, dict) and isinstance(ext.get("text"), str):
        return ext["text"].strip()

    for key in ("documentMessage", "imageMessage", "videoMessage"):
        part = msg.get(key)
        if isinstance(part, dict) and isinstance(part.get("caption"), str):
            return part["caption"].strip()

    protocol = msg.get("protocolMessage")
    if isinstance(protocol, dict):
        edited = protocol.get("editedMessage")
        if isinstance(edited, dict):
            return own_text({"message": edited})

    return ""


def document_info(record):
    msg = unwrap_message(record.get("message") or {})
    doc = msg.get("documentMessage")
    if not isinstance(doc, dict):
        return None

    filename = str(doc.get("fileName") or doc.get("title") or "").strip()
    mimetype = str(doc.get("mimetype") or "").strip()

    if not filename:
        ext = ".xlsx" if "spreadsheet" in mimetype else ".csv" if "csv" in mimetype else ""
        filename = f"planilha_whatsapp{ext}"

    suffix = Path(filename).suffix.lower()
    if suffix not in (".csv", ".xlsx"):
        # Tenta inferir pela MIME.
        if "csv" in mimetype:
            suffix = ".csv"
            filename = Path(filename).stem + suffix
        elif (
            "spreadsheet" in mimetype
            or "excel" in mimetype
            or "officedocument.spreadsheetml" in mimetype
        ):
            suffix = ".xlsx"
            filename = Path(filename).stem + suffix
        else:
            return None

    return {
        "filename": filename,
        "mimetype": mimetype,
        "suffix": suffix,
    }


def evo():
    load_dotenv(RELATORIO_ENV_FILE)

    key = os.getenv("AUTHENTICATION_API_KEY")
    if not key:
        raise RuntimeError("AUTHENTICATION_API_KEY não encontrada no .env.")

    base = os.getenv("EVOLUTION_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
    instance = os.getenv("EVOLUTION_INSTANCE", "sgp-whatsapp")

    return base, instance, {
        "apikey": key,
        "Content-Type": "application/json",
    }


def send_text(base, instance, headers, destination, text):
    r = requests.post(
        f"{base}/message/sendText/{instance}",
        headers=headers,
        json={"number": destination, "text": text},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def fetch_recent(base, instance, headers, limit=MAX_RECENTES):
    r = requests.post(
        f"{base}/chat/findMessages/{instance}",
        headers=headers,
        json={"page": 1, "offset": limit},
        timeout=60,
    )
    r.raise_for_status()

    raw = r.json()
    data = raw.get("messages", raw)

    if isinstance(data, dict):
        rows = data.get("records") or data.get("data") or []
    elif isinstance(data, list):
        rows = data
    else:
        rows = []

    return rows


def rec_ts(rec):
    raw = rec.get("messageTimestamp") or rec.get("timestamp") or 0
    try:
        raw = float(raw)
        if raw > 10_000_000_000:
            raw /= 1000
        return raw
    except Exception:
        return 0.0


def message_id(rec):
    return str((rec.get("key") or {}).get("id") or "")


def _jid_values(rec):
    """Coleta JIDs/identificadores que a Evolution pode fornecer para o remetente."""
    key = rec.get("key") or {}
    vals = []

    for source in (key, rec):
        if not isinstance(source, dict):
            continue
        for field in (
            "remoteJidAlt",
            "remoteJid",
            "participantAlt",
            "participant",
            "senderPn",
            "senderLid",
            "jid",
        ):
            value = source.get(field)
            if isinstance(value, str) and value.strip() and value not in vals:
                vals.append(value.strip())

    return vals


def chat_id(rec):
    """
    Prefere o JID telefônico quando a Evolution também entrega um @lid.
    Isso evita responder para um identificador interno quando existe o
    @s.whatsapp.net real do contato.
    """
    vals = _jid_values(rec)

    for value in vals:
        if value.endswith("@s.whatsapp.net"):
            return value

    for value in vals:
        if value.endswith("@g.us"):
            return value

    return vals[0] if vals else ""


def from_me(rec):
    return bool((rec.get("key") or {}).get("fromMe"))


def jid_digits(jid):
    base = str(jid or "").split("@", 1)[0]
    return re.sub(r"\D", "", base)


def phone_variants(value):
    """
    Retorna variações usuais de número brasileiro, inclusive com/sem o 9º
    dígito, sem decidir à força qual delas é a correta.
    """
    d = jid_digits(value)
    if not d:
        return set()

    variants = {d}

    if len(d) in (10, 11):
        variants.add("55" + d)

    if d.startswith("55"):
        if len(d) == 12:
            variants.add(d[:4] + "9" + d[4:])
        elif len(d) == 13 and d[4:5] == "9":
            variants.add(d[:4] + d[5:])

    return variants


def sender_number_candidates(rec):
    out = set()
    for value in _jid_values(rec):
        out.update(phone_variants(value))
    return out


def sender_name(rec):
    """Tenta aproveitar o nome/pushName entregue pela Evolution, quando existir."""
    for source in (rec, rec.get("key") or {}):
        if not isinstance(source, dict):
            continue
        for field in (
            "pushName",
            "senderName",
            "participantName",
            "verifiedBizName",
            "name",
        ):
            value = source.get(field)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def is_teamo_contact(rec):
    allowed = phone_variants(CONTATO_TEAMO)
    return bool(sender_number_candidates(rec) & allowed)


def resolve_private_reply_jid(rec):
    """
    Usa o identificador telefônico que veio na própria mensagem recebida.
    É mais confiável do que reconstruir o destino a partir do cadastro manual.
    """
    vals = _jid_values(rec)

    for value in vals:
        if value.endswith("@s.whatsapp.net"):
            return value

    for value in vals:
        d = jid_digits(value)
        if d and len(d) >= 10:
            return d + "@s.whatsapp.net"

    return vals[0] if vals else ""


def load_groups():
    if not CONFIG_GRUPOS.exists():
        raise RuntimeError(
            "grupos_relatorio_os.json não encontrado. "
            "Abra o painel normal e salve Origem/Destino primeiro."
        )

    data = json.loads(CONFIG_GRUPOS.read_text(encoding="utf-8"))
    origem = data.get("origem") or data.get("origin")
    destino = data.get("destino") or data.get("dest")

    if not origem or not origem.get("id"):
        raise RuntimeError("Grupo de origem não configurado.")
    if not destino or not destino.get("id"):
        raise RuntimeError("Grupo de destino não configurado.")

    return origem, destino


def latest_sheet():
    PASTA_PLANILHAS.mkdir(parents=True, exist_ok=True)

    files = []
    for ext in ("*.csv", "*.xlsx"):
        files.extend(PASTA_PLANILHAS.glob(ext))

    files = [p for p in files if p.is_file() and not p.name.startswith("~$")]
    if not files:
        return None

    return max(files, key=lambda p: p.stat().st_mtime)


def _empty_registry():
    return {
        "versao": 1,
        "usuarios": [],
    }


def load_report_users():
    if not ARQ_USUARIOS_RELATORIO.exists():
        return _empty_registry()

    try:
        data = json.loads(ARQ_USUARIOS_RELATORIO.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_registry()
        if not isinstance(data.get("usuarios"), list):
            data["usuarios"] = []
        data.setdefault("versao", 1)
        return data
    except Exception:
        return _empty_registry()


def save_report_users(data):
    """Grava a lista de usuários de forma persistente e atômica."""
    ARQ_USUARIOS_RELATORIO.parent.mkdir(parents=True, exist_ok=True)
    tmp = ARQ_USUARIOS_RELATORIO.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    tmp.replace(ARQ_USUARIOS_RELATORIO)


def _user_phone_variants(user):
    out = set()
    for field in ("numero", "jid", "identificacao"):
        value = user.get(field)
        if value:
            out.update(phone_variants(value))
    return out


def find_registered_user(rec):
    registry = load_report_users()
    incoming_jid = chat_id(rec)
    incoming_identifiers = set(_jid_values(rec))
    incoming_numbers = sender_number_candidates(rec)

    for user in registry.get("usuarios", []):
        if not isinstance(user, dict):
            continue

        stored_ids = {
            str(user.get("jid") or ""),
            str(user.get("identificacao") or ""),
        }
        stored_ids.discard("")

        if stored_ids & incoming_identifiers:
            return user

        if incoming_numbers & _user_phone_variants(user):
            return user

        if incoming_jid and incoming_jid in stored_ids:
            return user

    return None


def register_report_user(rec):
    registry = load_report_users()
    existing = find_registered_user(rec)

    now = datetime.now().astimezone().isoformat(timespec="seconds")
    jid = chat_id(rec)
    number_candidates = sender_number_candidates(rec)

    numero = jid_digits(jid)
    if not numero and number_candidates:
        numero = sorted(number_candidates, key=len, reverse=True)[0]

    nome = sender_name(rec)

    if existing is not None:
        changed = False

        if not existing.get("ativo", False):
            existing["ativo"] = True
            existing["reativado_em"] = now
            changed = True

        if nome and nome != existing.get("nome"):
            existing["nome"] = nome
            changed = True
        if jid and jid != existing.get("jid"):
            existing["jid"] = jid
            changed = True
        if numero and numero != existing.get("numero"):
            existing["numero"] = numero
            changed = True

        if changed:
            existing["atualizado_em"] = now
            save_report_users(registry)

        return existing, False

    user = {
        "identificacao": jid or (numero or ""),
        "jid": jid,
        "numero": numero,
        "nome": nome,
        "registrado_em": now,
        "ativo": True,
    }
    registry.setdefault("usuarios", []).append(user)
    save_report_users(registry)
    return user, True


def report_commands_message():
    return (
        "Comandos disponíveis do relatório:\n"
        "• !relatorio\n"
        "• !relatorio local\n"
        "• !relatorio planilha\n"
        "• !relatorio aqui\n"
        "• !relatório registrar"
    )


def handle_register(base, instance, headers, rec):
    jid = chat_id(rec)
    if not jid:
        return

    user, created = register_report_user(rec)

    if created:
        text = (
            "✅ Você foi registrado para utilizar e receber os relatórios.\n\n"
            + report_commands_message()
        )
        write_log(
            f"USUARIO RELATORIO REGISTRADO | jid={user.get('jid')} | "
            f"numero={user.get('numero')} | nome={user.get('nome')}"
        )
    else:
        text = (
            "✅ Você já está registrado para utilizar e receber os relatórios.\n\n"
            + report_commands_message()
        )
        write_log(
            f"USUARIO RELATORIO JA REGISTRADO | jid={user.get('jid')} | "
            f"numero={user.get('numero')}"
        )

    send_text(base, instance, headers, jid, text)


def ensure_report_registered(base, instance, headers, rec):
    user = find_registered_user(rec)

    if user and bool(user.get("ativo", False)):
        return True

    jid = chat_id(rec)
    if jid:
        send_text(
            base,
            instance,
            headers,
            jid,
            "⛔ Você ainda não está registrado para utilizar os relatórios.\n\n"
            "Envie *!relatório registrar* para se registrar."
        )

    write_log(f"COMANDO RELATORIO NEGADO | chat={jid} | usuario_nao_registrado")
    return False


def write_log(text):
    LOG_DIR.mkdir(exist_ok=True)
    p = LOG_DIR / f"comando_{datetime.now().strftime('%Y%m%d')}.log"
    with p.open("a", encoding="utf-8") as f:
        f.write(f"[{datetime.now().strftime('%H:%M:%S')}] {text}\n")


def parse_summary(stdout):
    def grab(pattern, default="?"):
        m = re.search(pattern, stdout, flags=re.I)
        return m.group(1) if m else default

    return {
        "apos_filtros": grab(r"OS apos filtros:\s*(\d+)"),
        "encontradas": grab(r"Encontradas no grupo:\s*(\d+)"),
        "revisar": grab(r"Revisar:\s*(\d+)"),
        "nao_encontradas": grab(r"Nao encontradas:\s*(\d+)"),
        "enviadas": grab(r"ENVIO CONCLUIDO\s*\|\s*(\d+)\s*OS enviadas"),
        "erros": grab(r"ENVIO CONCLUIDO\s*\|.*?\|\s*(\d+)\s*erro"),
    }


def safe_filename(name):
    name = Path(name or "planilha.xlsx").name
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name or "planilha.xlsx"


def _extract_base64_payload(data):
    if isinstance(data, str):
        s = data.strip()
        if s.startswith("data:") and "," in s:
            s = s.split(",", 1)[1]
        return s

    if isinstance(data, dict):
        for key in ("base64", "data", "media"):
            value = data.get(key)
            if isinstance(value, str) and len(value) > 20:
                return _extract_base64_payload(value)
            if isinstance(value, dict):
                got = _extract_base64_payload(value)
                if got:
                    return got

        response = data.get("response")
        if isinstance(response, dict):
            got = _extract_base64_payload(response)
            if got:
                return got

    return None


def download_document(base, instance, headers, rec):
    info = document_info(rec)
    if not info:
        raise RuntimeError(
            "A mensagem selecionada não contém uma planilha CSV/XLSX reconhecida."
        )

    mid = message_id(rec)
    if not mid:
        raise RuntimeError("O anexo não possui ID de mensagem.")

    endpoint = f"{base}/chat/getBase64FromMediaMessage/{instance}"

    # A Evolution aceita o identificador da mensagem. Algumas builds também
    # aceitam o objeto completo, então usamos fallback automático.
    payloads = [
        {
            "message": {"key": {"id": mid}},
            "convertToMp4": False,
        },
        {
            "message": rec,
            "convertToMp4": False,
        },
    ]

    last_error = None
    b64 = None
    for payload in payloads:
        try:
            r = requests.post(endpoint, headers=headers, json=payload, timeout=120)
            if not r.ok:
                last_error = f"HTTP {r.status_code}: {r.text[:800]}"
                continue

            try:
                data = r.json()
            except Exception:
                data = r.text

            b64 = _extract_base64_payload(data)
            if b64:
                break

            last_error = "A Evolution respondeu, mas não retornou base64 reconhecível."
        except Exception as e:
            last_error = str(e)

    if not b64:
        raise RuntimeError(
            "Não consegui baixar a planilha pela Evolution. "
            + (last_error or "Sem detalhes.")
        )

    try:
        raw = base64.b64decode(b64, validate=False)
    except Exception as e:
        raise RuntimeError(f"Base64 do anexo inválido: {e}")

    if not raw:
        raise RuntimeError("A planilha baixada veio vazia.")

    PASTA_RECEBIDAS.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = safe_filename(info["filename"])
    path = PASTA_RECEBIDAS / f"{stamp}_{name}"
    path.write_bytes(raw)

    return path


def find_sheet_for_planilha_command(rows, command_rec):
    """
    Aceita:
    1) planilha com legenda !relatorio planilha;
    2) texto !relatorio planilha logo depois de enviar uma planilha
       no mesmo chat (janela de 10 minutos).
    """
    if document_info(command_rec):
        return command_rec

    jid = chat_id(command_rec)
    cts = rec_ts(command_rec)

    candidates = []
    for rec in rows:
        if chat_id(rec) != jid:
            continue
        if not document_info(rec):
            continue

        ts = rec_ts(rec)
        if cts and ts:
            delta = cts - ts
            if delta < 0 or delta > JANELA_ANEXO_SEGUNDOS:
                continue

        candidates.append(rec)

    if not candidates:
        return None

    candidates.sort(key=rec_ts, reverse=True)
    return candidates[0]


def run_report(sheet, origem_id, destino_id):
    if not MOTOR.exists():
        raise RuntimeError("motor_relatorio_os.py não encontrado no app.")

    LOG_DIR.mkdir(exist_ok=True)
    out_folder = OUTPUT_DIR
    out_folder.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        str(MOTOR),
        str(sheet),
        "--grupo-origem", origem_id,
        "--grupo-destino", destino_id,
        "--saida", str(out_folder),
        "--executar",
    ]

    proc = subprocess.run(
        cmd,
        cwd=str(APP_DIR),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    full = (proc.stdout or "") + "\n" + (proc.stderr or "")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    (LOG_DIR / f"execucao_{stamp}.txt").write_text(full, encoding="utf-8")

    if proc.returncode != 0:
        tail = "\n".join(full.strip().splitlines()[-8:])
        raise RuntimeError(
            "O motor terminou com erro.\n\n" + (tail or "Sem detalhes.")
        )

    return parse_summary(full), full


def send_result(base, instance, headers, jid, sheet, source_label, summary):
    msg = (
        "✅ *Relatório concluído*\n\n"
        f"Modo: *{source_label}*\n"
        f"Planilha: *{sheet.name}*\n\n"
        f"OS após filtros: *{summary['apos_filtros']}*\n"
        f"Encontradas: *{summary['encontradas']}*\n"
        f"Revisar: *{summary['revisar']}*\n"
        f"Não encontradas: *{summary['nao_encontradas']}*\n"
        f"Enviadas: *{summary['enviadas']}*\n"
        f"Erros de envio: *{summary['erros']}*"
    )
    send_text(base, instance, headers, jid, msg)


def execute_for_sheet(base, instance, headers, jid, sheet, source_label):
    origem, destino = load_groups()

    send_text(
        base, instance, headers, jid,
        "⏳ Iniciando relatório.\n"
        f"Modo: *{source_label}*\n"
        f"Planilha: *{sheet.name}*\n"
        f"Origem: *{origem.get('name', origem['id'])}*\n"
        f"Destino: *{destino.get('name', destino['id'])}*"
    )

    write_log(
        f"EXECUTANDO | modo={source_label} | planilha={sheet} | "
        f"origem={origem['id']} | destino={destino['id']}"
    )

    try:
        summary, _ = run_report(sheet, origem["id"], destino["id"])
        send_result(base, instance, headers, jid, sheet, source_label, summary)
        write_log("CONCLUÍDO | " + repr(summary))
    except Exception as e:
        write_log(f"ERRO | {e}")
        send_text(
            base, instance, headers, jid,
            "❌ O relatório não foi concluído.\n"
            f"Erro: {str(e)[:1500]}"
        )



def execute_for_sheet_here(base, instance, headers, jid, sheet):
    """
    Executa o MESMO motor atual, mas troca apenas o destino:
    em vez do grupo de destino salvo, envia para o chat privado
    de quem mandou !relatorio aqui.
    """
    origem, _destino_salvo = load_groups()

    send_text(
        base, instance, headers, jid,
        "⏳ Iniciando relatório *aqui*.\n"
        f"Planilha: *{sheet.name}*\n"
        f"Origem: *{origem.get('name', origem['id'])}*\n"
        "Destino: *este chat*"
    )

    write_log(
        f"EXECUTANDO AQUI | planilha={sheet} | "
        f"origem={origem['id']} | destino_chat={jid}"
    )

    try:
        summary, _ = run_report(sheet, origem["id"], jid)
        send_result(base, instance, headers, jid, sheet, "AQUI", summary)
        write_log("CONCLUÍDO AQUI | " + repr(summary))
    except Exception as e:
        write_log(f"ERRO AQUI | {e}")
        send_text(
            base, instance, headers, jid,
            "❌ O relatório não foi concluído.\n"
            f"Erro: {str(e)[:1500]}"
        )


def handle_aqui(base, instance, headers, jid):
    sheet = latest_sheet()
    if sheet is None:
        send_text(
            base, instance, headers, jid,
            "⚠️ Não encontrei planilha em *C:\\RelatoriosSGP*.\n"
            "Coloque um CSV/XLSX na pasta e mande *!relatorio aqui* novamente."
        )
        return

    execute_for_sheet_here(base, instance, headers, jid, sheet)


def handle_local(base, instance, headers, jid):
    sheet = latest_sheet()
    if sheet is None:
        send_text(
            base, instance, headers, jid,
            "⚠️ Não encontrei planilha em *C:\\RelatoriosSGP*.\n"
            "Coloque um CSV/XLSX na pasta e mande *!relatorio local* novamente."
        )
        return

    execute_for_sheet(base, instance, headers, jid, sheet, "LOCAL")


def handle_planilha(base, instance, headers, jid, rows, command_rec):
    media_rec = find_sheet_for_planilha_command(rows, command_rec)

    if media_rec is None:
        send_text(
            base, instance, headers, jid,
            "⚠️ Não encontrei uma planilha anexada.\n\n"
            "Você pode:\n"
            "1. enviar o CSV/XLSX com a legenda *!relatorio planilha*; ou\n"
            "2. enviar a planilha e, em seguida, mandar *!relatorio planilha*."
        )
        return

    send_text(
        base, instance, headers, jid,
        "📥 Planilha encontrada. Baixando o anexo..."
    )

    try:
        sheet = download_document(base, instance, headers, media_rec)
    except Exception as e:
        write_log(f"ERRO DOWNLOAD PLANILHA | {e}")
        send_text(
            base, instance, headers, jid,
            "❌ Não consegui baixar a planilha do WhatsApp.\n"
            f"Erro: {str(e)[:1500]}"
        )
        return

    execute_for_sheet(base, instance, headers, jid, sheet, "PLANILHA WHATSAPP")


def main():
    PASTA_PLANILHAS.mkdir(parents=True, exist_ok=True)
    PASTA_RECEBIDAS.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(exist_ok=True)

    base, instance, headers = evo()

    print("=" * 72)
    print("COMANDO WHATSAPP -> RELATÓRIO DE OS | USUÁRIOS REGISTRADOS")
    print("=" * 72)
    print(f"Pasta local: {PASTA_PLANILHAS}")
    print(f"Planilhas recebidas: {PASTA_RECEBIDAS}")
    print()
    print("Comandos:")
    print(f"  {COMANDO_LOCAL}      -> usa a planilha mais recente da pasta local")
    print(f"  {COMANDO_PLANILHA}   -> usa a planilha enviada pelo WhatsApp")
    print(f"  {COMANDO_AQUI}       -> usa a planilha local e envia o relatório neste chat")
    print(f"  {COMANDO_ANTIGO}            -> compatibilidade; equivale a LOCAL")
    print(f"  {COMANDO_REGISTRAR} -> registra o usuário no módulo de relatórios")
    print()
    print(
        f"Comando paralelo: !teamo / !te amo somente para "
        f"+55 34 9682-0410"
    )
    print()
    print("Relatórios: somente usuários registrados com !relatório registrar.")
    print("Deixe esta janela aberta durante o teste.")
    print()

    r = requests.get(
        f"{base}/instance/connectionState/{instance}",
        headers=headers,
        timeout=30,
    )
    r.raise_for_status()
    print("Evolution acessível.")
    print()

    # Ignora mensagens antigas ao iniciar para não executar comando velho.
    seen = set()
    for rec in fetch_recent(base, instance, headers):
        mid = message_id(rec)
        if mid:
            seen.add(mid)

    print("Escutando novas mensagens...")
    write_log("LISTENER USUARIOS REGISTRADOS INICIADO")

    while True:
        try:
            rows = fetch_recent(base, instance, headers)
            rows = sorted(rows, key=rec_ts)

            for rec in rows:
                mid = message_id(rec)
                if not mid or mid in seen:
                    continue

                seen.add(mid)

                jid = chat_id(rec)
                if not jid or jid.endswith("@g.us"):
                    continue

                cmd = norm_cmd(own_text(rec))

                # Comando paralelo: independente do módulo de relatórios.
                is_teamo_cmd = cmd in {norm_cmd(x) for x in COMANDOS_TEAMO}
                if is_teamo_cmd and not from_me(rec) and is_teamo_contact(rec):
                    destino_teamo = resolve_private_reply_jid(rec)
                    print(
                        f"Comando !te amo recebido | origem={_jid_values(rec)} | "
                        f"destino_resolvido={destino_teamo}"
                    )
                    write_log(
                        f"COMANDO TEAMO RECEBIDO | origem={_jid_values(rec)} | "
                        f"destino={destino_teamo} | contato={CONTATO_TEAMO}"
                    )
                    try:
                        send_text(
                            base,
                            instance,
                            headers,
                            destino_teamo,
                            MENSAGEM_TEAMO,
                        )
                        write_log(f"COMANDO TEAMO RESPONDIDO | destino={destino_teamo}")
                    except Exception as e:
                        write_log(f"ERRO TEAMO | destino={destino_teamo} | {e}")
                        print(f"[ERRO TEAMO] {e}")
                    continue

                if is_teamo_cmd:
                    write_log(
                        f"COMANDO TEAMO IGNORADO | chat={jid} | "
                        f"numeros={sorted(sender_number_candidates(rec))}"
                    )
                    continue

                # Registro é autoatendimento e não depende de autorização prévia.
                if cmd == norm_cmd(COMANDO_REGISTRAR):
                    handle_register(base, instance, headers, rec)
                    continue

                if cmd not in (
                    norm_cmd(COMANDO_LOCAL),
                    norm_cmd(COMANDO_PLANILHA),
                    norm_cmd(COMANDO_AQUI),
                    norm_cmd(COMANDO_ANTIGO),
                ):
                    continue

                print(
                    f"Comando recebido | {cmd} | chat={jid} | "
                    f"fromMe={from_me(rec)}"
                )
                write_log(
                    f"COMANDO RECEBIDO | cmd={cmd} | chat={jid} | "
                    f"fromMe={from_me(rec)}"
                )

                if not ensure_report_registered(base, instance, headers, rec):
                    continue

                if cmd in (norm_cmd(COMANDO_LOCAL), norm_cmd(COMANDO_ANTIGO)):
                    handle_local(base, instance, headers, jid)
                elif cmd == norm_cmd(COMANDO_AQUI):
                    handle_aqui(base, instance, headers, jid)
                else:
                    handle_planilha(base, instance, headers, jid, rows, rec)

        except KeyboardInterrupt:
            print("\nEncerrado.")
            return
        except Exception as e:
            print(f"[ERRO] {e}")
            write_log(f"ERRO LOOP | {e}")

        time.sleep(INTERVALO)


if __name__ == "__main__":
    main()
