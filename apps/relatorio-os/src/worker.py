from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent
PLANILHAS = Path(os.getenv("RELATORIO_PLANILHAS_DIR", "/data/planilhas")).resolve()
OUTPUT = Path(os.getenv("RELATORIO_OUTPUT_DIR", "/data/relatorio-os/saida")).resolve()
LOG_DIR = Path(os.getenv("RELATORIO_LISTENER_LOG_DIR", "/data/logs/relatorio-os/listener")).resolve()
GROUPS_FILE = Path(os.getenv("RELATORIO_GROUPS_FILE", "/data/config/grupos_relatorio_os.json")).resolve()
USERS_FILE = Path(os.getenv("RELATORIO_USERS_FILE", "/data/config/usuarios_relatorio.json")).resolve()
MOTOR = Path(os.getenv("RELATORIO_MOTOR", HERE / "motor_relatorio_os.py")).resolve()
LISTENER = Path(os.getenv("RELATORIO_LISTENER", HERE / "COMANDO_WHATSAPP_RELATORIO_USUARIOS.py")).resolve()
PORT = int(os.getenv("RELATORIO_WORKER_PORT", "8090"))
HOST = os.getenv("RELATORIO_WORKER_HOST", "0.0.0.0")

listener_process: subprocess.Popen | None = None
execute_lock = threading.Lock()
started_at = time.time()


def ensure_dirs():
    for path in (PLANILHAS, OUTPUT, LOG_DIR, GROUPS_FILE.parent, USERS_FILE.parent):
        path.mkdir(parents=True, exist_ok=True)
    if not GROUPS_FILE.exists():
        GROUPS_FILE.write_text('{"origem": null, "destino": null}\n', encoding="utf-8")
    if not USERS_FILE.exists():
        USERS_FILE.write_text('{"versao": 1, "usuarios": []}\n', encoding="utf-8")


def start_listener():
    global listener_process
    ensure_dirs()
    log_path = LOG_DIR / "worker-listener.log"
    log_handle = open(log_path, "a", encoding="utf-8", buffering=1)
    listener_process = subprocess.Popen(
        [sys.executable, str(LISTENER)],
        cwd=str(HERE),
        env=os.environ.copy(),
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        text=True,
    )

    def monitor():
        code = listener_process.wait()
        log_handle.write(f"\n[worker] listener encerrou com código {code}; encerrando container.\n")
        log_handle.flush()
        os._exit(code if code else 1)

    threading.Thread(target=monitor, daemon=True).start()


def safe_sheet(name: str) -> Path:
    base = Path(str(name or "")).name
    if not base.lower().endswith((".csv", ".xlsx")):
        raise ValueError("Planilha inválida")
    full = (PLANILHAS / base).resolve()
    if full.parent != PLANILHAS:
        raise ValueError("Caminho inválido")
    if not full.is_file():
        raise FileNotFoundError(base)
    return full


def health_payload():
    running = bool(listener_process and listener_process.poll() is None)
    return {
        "ok": running and MOTOR.is_file(),
        "service": "relatorio-os-worker",
        "uptimeSeconds": int(time.time() - started_at),
        "listener": {
            "running": running,
            "pid": listener_process.pid if running else None,
            "returnCode": None if running else (listener_process.poll() if listener_process else None),
        },
        "motor": {"exists": MOTOR.is_file()},
        "config": {
            "groupsFile": GROUPS_FILE.is_file(),
            "usersFile": USERS_FILE.is_file(),
        },
        "execution": {"busy": execute_lock.locked()},
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "CentralOSRelatorioWorker/1.0"

    def log_message(self, fmt, *args):
        sys.stdout.write("[worker-http] " + (fmt % args) + "\n")
        sys.stdout.flush()

    def send_json(self, status: int, data: dict):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = min(int(self.headers.get("Content-Length") or 0), 1024 * 1024)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_GET(self):
        if self.path in ("/health", "/ready"):
            payload = health_payload()
            return self.send_json(200 if payload["ok"] else 503, payload)
        return self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/execute":
            return self.send_json(404, {"error": "not_found"})
        if not execute_lock.acquire(blocking=False):
            return self.send_json(409, {"error": "report_running"})
        try:
            data = self.read_json()
            sheet = safe_sheet(data.get("fileName"))
            origem = str(data.get("grupoOrigem") or "").strip()
            destino = str(data.get("grupoDestino") or "").strip()
            if not origem or not destino:
                return self.send_json(400, {"error": "groups_required"})
            OUTPUT.mkdir(parents=True, exist_ok=True)
            cmd = [
                sys.executable, str(MOTOR), str(sheet),
                "--grupo-origem", origem,
                "--grupo-destino", destino,
                "--saida", str(OUTPUT),
                "--executar",
            ]
            if data.get("executionId"):
                cmd.extend(["--execution-id", str(data["executionId"])])
            if data.get("importId"):
                cmd.extend(["--import-id", str(data["importId"])])
            if data.get("source"):
                cmd.extend(["--source", str(data["source"])])
            try:
                proc = subprocess.run(
                    cmd, cwd=str(HERE), env=os.environ.copy(),
                    capture_output=True, text=True, timeout=30 * 60,
                )
            except subprocess.TimeoutExpired as exc:
                return self.send_json(504, {"error": "motor_timeout", "stdout": (exc.stdout or "")[-1000000:], "stderr": (exc.stderr or "")[-1000000:]})
            payload = {
                "ok": proc.returncode == 0,
                "returnCode": proc.returncode,
                "stdout": (proc.stdout or "")[-5000000:],
                "stderr": (proc.stderr or "")[-5000000:],
            }
            if data.get("executionId"):
                result_file = OUTPUT / f"execution_result_{data['executionId']}.json"
                if result_file.is_file():
                    payload["contract"] = json.loads(result_file.read_text(encoding="utf-8"))
            return self.send_json(200 if proc.returncode == 0 else 500, payload)
        except FileNotFoundError as exc:
            return self.send_json(404, {"error": "spreadsheet_not_found", "detail": str(exc)})
        except ValueError as exc:
            return self.send_json(400, {"error": "invalid_request", "detail": str(exc)})
        except Exception as exc:
            return self.send_json(500, {"error": "worker_error", "detail": str(exc)})
        finally:
            execute_lock.release()


if __name__ == "__main__":
    ensure_dirs()
    start_listener()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Relatório OS worker: http://{HOST}:{PORT}", flush=True)
    httpd.serve_forever()
