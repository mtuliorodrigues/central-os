# Inicialização

`INICIAR_TUDO.bat` usa somente a infraestrutura Evolution/PostgreSQL existente. Ele pode iniciar o Docker Desktop e executar `docker compose up -d` no compose legado configurado por `EVOLUTION_EXISTING_DIR`, mas não cria nova stack, novo banco nem nova instância.

Ordem: Docker -> compose existente (se necessário) -> PostgreSQL `SELECT 1` -> Evolution HTTP -> `sgp-whatsapp` conectada -> Python/venv -> listener único -> Node -> `/api/resumo` funcional -> healthcheck final.

Na primeira execução, dependências Python/Node podem ser instaladas. `scripts/IMPORTAR_CONFIG_LOCAL.ps1` copia, sem alterar a origem, `.env`, grupos e usuários do ambiente atual quando disponíveis.
