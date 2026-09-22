#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
CENTRAL="$ROOT/apps/central-os"; REPORT="$ROOT/apps/relatorio-os"; EVO=18081
TMP="$(mktemp -d)"; EVENTS="$TMP/events.jsonl"; GROUPS_FILE="$REPORT/config/grupos_relatorio_os.json"; USERS="$REPORT/config/usuarios_relatorio.json"; SHEET="$ROOT/data/planilhas/synthetic-listener.csv"; OUT="$TMP/out"; LOGDIR="$TMP/listener-logs"
cleanup(){ kill ${EVO_PID:-0} ${LISTENER_PID:-0} 2>/dev/null||true;wait ${EVO_PID:-0} ${LISTENER_PID:-0} 2>/dev/null||true;rm -f "$GROUPS_FILE" "$USERS" "$SHEET";rm -rf "$TMP"; }
trap cleanup EXIT
mkdir -p "$REPORT/config" "$ROOT/data/planilhas" "$OUT" "$LOGDIR"
cat > "$GROUPS_FILE" <<JSON
{"origem":{"id":"111111111111@g.us","name":"TÉC.PLAY"},"destino":{"id":"222222222222@g.us","name":"DESTINO TESTE"}}
JSON
cat > "$USERS" <<JSON
{"versao":1,"usuarios":[{"identificacao":"5534999999999@s.whatsapp.net","jid":"5534999999999@s.whatsapp.net","numero":"5534999999999","nome":"Usuario Teste","ativo":true}]}
JSON
cat > "$SHEET" <<CSV
OS;Cliente;Contrato;Login;Serviço;Conteúdo;Criada;POP;Bairro;Tipo;CPF/CNPJ
9001;Maria Sintetica;12345;maria;Internet Fibra;Sem conexão teste sintético;$(date +%d/%m/%Y);CAMPO FLORIDO;CENTRO;SUPORTE;12345678901
CSV
FAKE_EVENTS="$EVENTS" FAKE_EVOLUTION_PORT=$EVO FAKE_LISTENER_COMMAND=1 python3 "$CENTRAL/test/fake-infra/evolution.py" & EVO_PID=$!
for i in $(seq 1 40);do curl -fsS "http://127.0.0.1:$EVO" >/dev/null 2>&1&&break;sleep .2;done
export CENTRAL_OS_ROOT="$ROOT" EVOLUTION_BASE_URL="http://127.0.0.1:$EVO" EVOLUTION_INSTANCE=sgp-whatsapp AUTHENTICATION_API_KEY=test-key RELATORIO_PLANILHAS_DIR="$ROOT/data/planilhas" RELATORIO_GROUPS_FILE="$GROUPS_FILE" RELATORIO_USERS_FILE="$USERS" RELATORIO_OUTPUT_DIR="$OUT" RELATORIO_LISTENER_LOG_DIR="$LOGDIR"
python3 -u "$REPORT/src/COMANDO_WHATSAPP_RELATORIO_USUARIOS.py" >"$TMP/listener.out" 2>"$TMP/listener.err" & LISTENER_PID=$!
PASS=0
for i in $(seq 1 80);do
  if [[ -f "$EVENTS" ]] && python3 - "$EVENTS" <<'PY' >/dev/null 2>&1
import json,sys
rows=[json.loads(x) for x in open(sys.argv[1],encoding='utf-8') if x.strip()]
assert any('/message/forwardMessage/' in x['path'] and x.get('body') for x in rows)
assert any('/message/sendText/' in x['path'] and 'Relatório concluído' in str(x.get('body',{}).get('text','')) for x in rows)
PY
  then PASS=1;break;fi
  if ! kill -0 $LISTENER_PID 2>/dev/null;then echo 'Listener encerrou';cat "$TMP/listener.err";cat "$TMP/listener.out";exit 1;fi
  sleep .5
done
if [[ $PASS -ne 1 ]];then echo 'Listener nao concluiu o fluxo';cat "$TMP/listener.out";cat "$TMP/listener.err";cat "$EVENTS" 2>/dev/null||true;exit 1;fi
grep -q 'Comando recebido' "$TMP/listener.out"
python3 - "$EVENTS" <<'PY'
import json,sys
rows=[json.loads(x) for x in open(sys.argv[1],encoding='utf-8') if x.strip()]
assert any('/message/forwardMessage/' in x['path'] and x.get('body') for x in rows)
assert any('/message/sendText/' in x['path'] and 'Relatório concluído' in str(x.get('body',{}).get('text','')) for x in rows)
print('LISTENER_COMMAND_TO_MOTOR_FAKE_E2E=PASS')
PY
