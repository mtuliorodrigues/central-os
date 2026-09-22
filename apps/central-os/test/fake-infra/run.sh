#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
CENTRAL="$ROOT/apps/central-os"
REPORT="$ROOT/apps/relatorio-os"
PORT=18790
EVO=18080
TMP="$(mktemp -d)"
EVENTS="$TMP/events.jsonl"
GROUPS_FILE="$REPORT/config/grupos_relatorio_os.json"
SHEET="$ROOT/data/planilhas/synthetic-integration.csv"
MOTOR_OUT="$TMP/motor-out"
cleanup(){
  kill ${SERVER_PID:-0} ${EVO_PID:-0} ${LISTENER_PID:-0} 2>/dev/null || true
  wait ${SERVER_PID:-0} ${EVO_PID:-0} ${LISTENER_PID:-0} 2>/dev/null || true
  rm -f "$GROUPS_FILE" "$SHEET"
  rm -f "$CENTRAL/data/current-import.json" "$CENTRAL/data/current-analysis.json" "$CENTRAL/data/analysis-history.json"
  rm -rf "$CENTRAL/data/history-details" "$TMP"
}
trap cleanup EXIT
mkdir -p "$ROOT/data/planilhas" "$REPORT/config" "$MOTOR_OUT"
cat > "$GROUPS_FILE" <<JSON
{"origem":{"id":"111111111111@g.us","name":"TÉC.PLAY"},"destino":{"id":"222222222222@g.us","name":"DESTINO TESTE"}}
JSON
cat > "$SHEET" <<CSV
OS;Cliente;Contrato;Login;Serviço;Conteúdo;Criada;POP;Bairro;Tipo;CPF/CNPJ
9001;Maria Sintetica;12345;maria;Internet Fibra;Sem conexão teste sintético;$(date +%d/%m/%Y);CAMPO FLORIDO;CENTRO;SUPORTE;12345678901
CSV
FAKE_EVENTS="$EVENTS" FAKE_EVOLUTION_PORT=$EVO python3 "$CENTRAL/test/fake-infra/evolution.py" & EVO_PID=$!
for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$EVO" >/dev/null 2>&1 && break; sleep .2; done
curl -fsS "http://127.0.0.1:$EVO" >/dev/null
python3 -c 'import time; time.sleep(90)' "$REPORT/src/COMANDO_WHATSAPP_RELATORIO_USUARIOS.py" & LISTENER_PID=$!
export PATH="$CENTRAL/test/fake-infra:$PATH"
export CENTRAL_OS_ROOT="$ROOT" CENTRAL_OS_PORT=$PORT EVOLUTION_BASE_URL="http://127.0.0.1:$EVO" EVOLUTION_INSTANCE=sgp-whatsapp AUTHENTICATION_API_KEY=test-key POSTGRES_CONTAINER=evolution_postgres POSTGRES_USER=evolution POSTGRES_DB=evolution RELATORIO_GROUPS_FILE="$GROUPS_FILE" RELATORIO_OUTPUT_DIR="$MOTOR_OUT" RELATORIO_ALLOW_WEB_EXECUTION=true
node "$CENTRAL/src/server.js" >"$TMP/server.out" 2>"$TMP/server.err" & SERVER_PID=$!
for i in $(seq 1 40); do curl -fsS "http://127.0.0.1:$PORT/api/resumo" >/dev/null 2>&1 && break; sleep .2; done
curl -fsS "http://127.0.0.1:$PORT/" > "$TMP/dashboard.html"
grep -q 'Relatório OS' "$TMP/dashboard.html"
grep -q 'statusPostgres' "$TMP/dashboard.html"
curl -fsS "http://127.0.0.1:$PORT/api/health" > "$TMP/health.json"
python3 - "$TMP/health.json" <<'PYHEALTH'
import json,sys
h=json.load(open(sys.argv[1])); assert h.get('service')=='central-os-integrada',h
print('DASHBOARD_AND_HEALTH_ENDPOINT=PASS')
PYHEALTH
B64=$(base64 -w0 "$SHEET")
printf '{"fileName":"synthetic-integration.csv","dataBase64":"%s"}' "$B64" > "$TMP/import.json"
curl -fsS -H 'Content-Type: application/json' --data-binary @"$TMP/import.json" "http://127.0.0.1:$PORT/api/planilha/importar" > "$TMP/import-response.json"
curl -fsS -X POST "http://127.0.0.1:$PORT/api/analise/processar" > "$TMP/analysis.json"
curl -fsS "http://127.0.0.1:$PORT/api/relatorio/status" > "$TMP/status.json"
curl -fsS -H 'Content-Type: application/json' -X POST --data '{"fileName":"synthetic-integration.csv"}' "http://127.0.0.1:$PORT/api/relatorio/executar" > "$TMP/report-exec.json"
python3 - "$TMP/analysis.json" "$TMP/status.json" "$TMP/report-exec.json" <<'PY'
import json,sys
a=json.load(open(sys.argv[1])); s=json.load(open(sys.argv[2])); r=json.load(open(sys.argv[3]))
assert a['totalSpreadsheetOS']==1, a
assert a['totalMatched']==1, a
assert a['items'][0]['classification']=='possivelmente_realizada', a['items'][0]
for key in ('docker','postgres','evolution'):
    assert s[key]['ok'] is True,(key,s[key])
assert s['whatsapp']['connected'] is True,s['whatsapp']
assert s['listener']['running'] is True and s['listener']['count']==1,s['listener']
assert s['config']['configured'] is True,s['config']
assert s['ready'] is True,s
assert r['ok'] is True,r
assert r['summary'].get('afterFilters')==1,r
assert r['summary'].get('found')==1,r
assert r['summary'].get('sent')==1,r
print('CENTRAL_OS_FAKE_E2E=PASS')
print('BRIDGE_TO_REAL_MOTOR_FAKE_EVOLUTION=PASS')
PY
AUTHENTICATION_API_KEY=test-key EVOLUTION_BASE_URL="http://127.0.0.1:$EVO" EVOLUTION_INSTANCE=sgp-whatsapp python3 "$REPORT/src/motor_relatorio_os.py" "$SHEET" --grupo-origem 111111111111@g.us --grupo-destino 222222222222@g.us --saida "$MOTOR_OUT" --executar > "$TMP/motor.log" 2>&1
grep -q 'ENVIO CONCLUIDO | 1 OS enviadas | 0 erro(s)' "$TMP/motor.log"
python3 - "$EVENTS" <<'PY'
import json,sys
rows=[json.loads(x) for x in open(sys.argv[1],encoding='utf-8') if x.strip()]
forward=[x for x in rows if '/message/forwardMessage/' in x['path'] and x.get('body')]
texts=[x for x in rows if '/message/sendText/' in x['path']]
assert len(forward)>=1, rows
assert any(x['body'].get('number')=='222222222222@g.us' for x in forward), forward
assert len(texts)>=2,texts
print('MOTOR_REAL_FAKE_EVOLUTION=PASS')
PY
echo 'FAKE_INFRA_FUNCTIONAL_TEST=PASS'
