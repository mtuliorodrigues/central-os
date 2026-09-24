# Inicialização

`INICIAR_TUDO.bat` usa somente a infraestrutura Evolution/PostgreSQL existente. Ele pode iniciar o Docker Desktop e executar `docker compose up -d` no compose legado configurado por `EVOLUTION_EXISTING_DIR`, mas não cria nova stack, novo banco nem nova instância.

Ordem: Docker -> compose existente (se necessário) -> Evolution HTTP -> validação da imagem `evolution-api-forward-sync-direct:2.3.7-phase2-fix1` -> PostgreSQL `SELECT 1` -> Redis `PING` -> `sgp-whatsapp` conectada -> Python/venv -> Node -> listener único -> `/api/health` e `/api/resumo` funcionais -> healthcheck final.

Na primeira execução, dependências Python/Node podem ser instaladas. `scripts/IMPORTAR_CONFIG_LOCAL.ps1` copia, sem alterar a origem, `.env`, grupos e usuários do ambiente atual quando disponíveis.

O resumo final informa separadamente o estado de Docker, PostgreSQL, Redis, Evolution, imagem Evolution aprovada, WhatsApp, configuração do Relatório OS, listener e Central OS. A imagem esperada pode ser sobrescrita localmente por `EVOLUTION_EXPECTED_IMAGE`, mas a configuração oficial desta fase usa `2.3.7-phase2-fix1`.
