# Núcleo de autenticação da Central OS

## Sessão

O backend usa token opaco server-side. O login devolve o token apenas ao cliente; o PostgreSQL armazena somente o SHA-256 do token na tabela `sessions`. O token futuro do frontend deve ficar em `sessionStorage`.

As sessões expiram por padrão em oito horas. O valor pode ser ajustado localmente por `CENTRAL_OS_SESSION_TTL_HOURS`. Sessões expiradas, revogadas ou associadas a usuários inativos são inválidas. `last_seen_at` é atualizado no máximo uma vez a cada cinco minutos.

## Senhas

As senhas usam `scrypt` nativo do Node com salt aleatório e parâmetros codificados no formato versionado `scrypt$1$N=...,r=...,p=...$salt$hash`. Nenhuma senha, hash de senha ou token é retornado pelos endpoints.

## MASTER_ADMIN

O primeiro administrador é criado somente pelo comando local `npm run admin:bootstrap`, que solicita nome, username, senha e confirmação. O comando recusa senha vazia, username repetido e qualquer segundo `MASTER_ADMIN`. A senha não é exibida em um terminal interativo.

O comando não é executado automaticamente nesta fase e nenhum usuário real foi criado.

## Frontend

O React usa `AuthProvider` e `AuthGate`. O token fica somente em `sessionStorage`, é validado no carregamento por `/api/auth/me` e é enviado pelo cliente HTTP como `Authorization: Bearer`. Respostas `401` limpam a sessão e retornam à tela de login; `403` permanece um erro de autorização. O logout chama o backend antes de limpar o token local.

## Endpoints

- `POST /api/auth/login`: recebe `username` e `password`, retorna `token`, `expiresAt` e dados públicos do usuário.
- `GET /api/auth/me`: exige `Authorization: Bearer <token>` e retorna o usuário autenticado.
- `POST /api/auth/logout`: exige o mesmo header e revoga a sessão.

O login possui rate limit simples em memória: cinco falhas por combinação de origem e username dentro de quinze minutos.

## Papéis e auditoria

Os papéis são `MASTER_ADMIN` e `USER`. O helper `requireMasterAdmin` está disponível para as próximas rotas administrativas; nenhuma rota operacional existente foi tornada obrigatória por login nesta fase.

São registrados em `audit_events` apenas `admin_bootstrapped`, `login_succeeded`, `login_failed`, `logout` e `session_revoked`. Logs e auditoria não recebem senha, token, header `Authorization` ou payload completo.

## Desativação e revogação

Usuários com `active = false` não fazem login e não podem usar sessões existentes. A revogação normal ocorre pelo endpoint de logout; sessões também podem ser revogadas diretamente por ferramenta administrativa futura.
