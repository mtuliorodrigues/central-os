FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    RELATORIO_WORKER_HOST=0.0.0.0 \
    RELATORIO_WORKER_PORT=8090 \
    RELATORIO_PLANILHAS_DIR=/srv/central-os/planilhas \
    RELATORIO_OUTPUT_DIR=/srv/central-os/reports \
    RELATORIO_LISTENER_LOG_DIR=/srv/central-os/logs/listener \
    RELATORIO_GROUPS_FILE=/srv/central-os/config/grupos_relatorio_os.json \
    RELATORIO_USERS_FILE=/srv/central-os/config/usuarios_relatorio.json

WORKDIR /app
COPY apps/relatorio-os/requirements.txt ./apps/relatorio-os/requirements.txt
RUN pip install --no-cache-dir -r apps/relatorio-os/requirements.txt
COPY apps/relatorio-os/src ./apps/relatorio-os/src

RUN useradd --create-home --uid 10001 centralos \
    && mkdir -p /srv/central-os/planilhas /srv/central-os/reports \
       /srv/central-os/logs/listener /srv/central-os/config \
    && chown -R centralos:centralos /app /srv/central-os

USER centralos
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import json,urllib.request; r=urllib.request.urlopen('http://127.0.0.1:8090/health', timeout=3); d=json.load(r); raise SystemExit(0 if d.get('ok') else 1)"

CMD ["python", "apps/relatorio-os/src/worker.py"]
