# Fundação de persistência da Central OS

## Separação

O banco lógico `central_os` pertence à Central OS e fica separado do banco usado pela Evolution. As migrations não consultam nem alteram tabelas privadas da Evolution.

## Configuração

Defina `CENTRAL_OS_DATABASE_URL` em `config/app.env` somente no ambiente local. O valor real não deve ser versionado. No ambiente Windows atual, o Compose externo publica PostgreSQL apenas em `127.0.0.1:15432` e a URL aponta para esse loopback, com o banco `central_os`.

Para bootstrap administrativo via Docker, defina opcionalmente `POSTGRES_CONTAINER`, `CENTRAL_OS_DATABASE_ADMIN_USER`, `CENTRAL_OS_DATABASE_NAME` e `CENTRAL_OS_DATABASE_APP_ROLE`. A senha do role é gerada apenas no ambiente local e gravada somente em `config/app.env`.

## Bootstrap e migrations

1. Execute `scripts/db-bootstrap.ps1` para criar o database lógico, o role restrito, suas permissões e aplicar a migration pelo Node.
2. O bootstrap grava `CENTRAL_OS_DATABASE_URL` somente em `config/app.env`, que é ignorado pelo Git.
3. Execute `npm run db:migrate` dentro de `apps/central-os` para uma execução normal e idempotente.
4. Execute `npm run db:health` para verificar a conexão da Central OS.

O runner aplica arquivos ordenados em `src/db/migrations` e registra versões em `schema_migrations`. Executá-lo novamente é idempotente.

## Testes

Os testes de persistência usam somente dados sintéticos e exigem uma URL de teste separada. Nunca apontar os testes para o banco da Evolution.

## Backup e rollback

O backup futuro deve incluir o database `central_os`, configurações não secretas e artefatos oficiais conforme a política de retenção. O rollback deve ser validado em database temporário/teste; não executar `DROP DATABASE` no ambiente operacional.

Esta fase não implementa login, não cria usuário administrador, não migra JSON/CSV e não torna o relatório operacional dependente do banco próprio.
