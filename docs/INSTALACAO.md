# Instalação reproduzível da Central OS Local

Este documento descreve uma instalação nova da Central OS Local no Windows. A instalação da aplicação é separada da instalação da Evolution e do pareamento do WhatsApp.

## Componentes

- `apps/central-os`: API Node, autenticação, persistência, histórico, auditoria e frontend servido no modo integrado.
- `apps/central-os/frontend`: frontend React/Vite.
- `apps/relatorio-os`: motor Python, contrato operacional e listener.
- PostgreSQL e Redis: infraestrutura da Evolution e do histórico `central_os`.
- Evolution API: transporte do WhatsApp e histórico de mensagens.

O repositório contém código, migrations, scripts, manifests de dependências e documentação. Não entram no Git: `.env`, `config/app.env`, credenciais, sessão do WhatsApp, volumes Docker, planilhas, relatórios, logs e dados operacionais.

## Pré-requisitos

Instale no Windows:

1. Docker Desktop com o Docker Engine ativo.
2. Node.js e npm compatíveis com os manifests e lockfiles do repositório.
3. Python 3 com suporte a `venv`.
4. Git.

As versões exatas observadas na máquina de desenvolvimento podem ser consultadas com `node --version`, `npm --version`, `python --version` e `docker version`. O projeto não fixa uma versão de Windows ou Docker no código; o requisito é que os comandos oficiais funcionem.

## Configuração local

1. Clone o repositório.
2. Copie `config/app.env.example` para `config/app.env`.
3. Preencha apenas os valores locais necessários. Nunca copie chaves para o Git.
4. Mantenha `CENTRAL_OS_ROOT` vazio para que o launcher use a raiz do repositório.
5. Configure `CENTRAL_OS_DATABASE_URL` para o banco `central_os` e use uma role da aplicação com as permissões necessárias.
6. Configure `AUTHENTICATION_API_KEY` somente no ambiente local que acessa a Evolution.

Variáveis principais:

| Variável | Uso | Obrigatória |
| --- | --- | --- |
| `CENTRAL_OS_PORT` | Porta da API local; o launcher usa `8788` | Não |
| `CENTRAL_OS_DATABASE_URL` | Conexão PostgreSQL do histórico e autenticação | Sim para persistência |
| `CENTRAL_OS_ALLOWED_ORIGINS` | Origens CORS permitidas | Não |
| `EVOLUTION_BASE_URL` | URL local da Evolution | Sim para integração |
| `EVOLUTION_INSTANCE` | Instância WhatsApp | Sim para integração |
| `AUTHENTICATION_API_KEY` | Chave da Evolution | Sim para consultar a instância |
| `POSTGRES_CONTAINER` / `POSTGRES_USER` / `POSTGRES_DB` | Verificações Docker da infraestrutura | Não |
| `REDIS_CONTAINER` | Verificação do Redis | Não |
| `RELATORIO_PLANILHAS_DIR` | Diretório de planilhas | Não; padrão dentro de `data` |
| `RELATORIO_GROUPS_FILE` | Configuração de grupos | Não; padrão em `apps/relatorio-os/config` |
| `RELATORIO_USERS_FILE` | Usuários do listener | Não; padrão em `apps/relatorio-os/config` |
| `RELATORIO_OUTPUT_DIR` | Artifacts e relatórios | Não; padrão dentro de `data` |
| `RELATORIO_LISTENER_LOG_DIR` | Logs do listener | Não; padrão dentro de `logs` |
| `RELATORIO_WORKER_URL` | Worker Python separado, quando utilizado | Não |
| `RELATORIO_ALLOW_WEB_EXECUTION` | Habilita execução pelo painel | Opcional e deve permanecer desativada até a validação operacional |

Nunca coloque senha, token ou API key em `VITE_*`; o frontend integrado usa a mesma origem da API.

## Banco central_os

Com PostgreSQL disponível, execute a partir de `apps/central-os`:

```powershell
npm ci
npm run db:migrate
npm run db:health
```

O runner aplica, em ordem, `001_initial_schema.sql` e `002_auth_foundation.sql`, registrando cada versão em `schema_migrations`. Em instalação nova, a conta inicial é criada interativamente:

```powershell
npm run admin:bootstrap
```

O PostgreSQL deve possuir o banco lógico central_os e uma role de aplicação, normalmente central_os_app, com acesso somente ao banco necessário. A senha da role fica apenas no ambiente local usado para compor CENTRAL_OS_DATABASE_URL; não existe valor padrão no repositório.

A senha é digitada no terminal e não aparece em logs. Não use a conta real para testes de instalação.

## Python

```powershell
cd apps/relatorio-os
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\..
```

As dependências oficiais são `pandas`, `requests`, `python-dotenv`, `rapidfuzz` e `openpyxl`. Valide com:

```powershell
apps\relatorio-os\.venv\Scripts\python.exe -m compileall -q apps\relatorio-os\src
apps\relatorio-os\.venv\Scripts\python.exe -m unittest discover -s apps\relatorio-os\test -p "test*.py"
```

## Evolution e WhatsApp

A aplicação espera a Evolution local, normalmente em `http://127.0.0.1:8080`, com a instância definida em `EVOLUTION_INSTANCE`. PostgreSQL, Redis, volumes e sessão pertencem à infraestrutura externa da Evolution e não são recriados pelo Git da Central OS.

Uma instalação nova pode chegar a:

```text
Central OS instalada
Evolution disponível
WhatsApp ainda não pareado
```

O pareamento por QR Code é uma etapa humana posterior. Não copie a sessão de outra máquina automaticamente.

## Primeiro start

Execute:

```text
C:\Central OS\INICIAR_TUDO.bat
```

O launcher verifica Docker, PostgreSQL, Redis, Evolution, instância WhatsApp, Python, Node, API, Listener e healthchecks. Em uma instalação em outro diretório, o `.bat` usa a pasta do próprio repositório; referências externas da Evolution devem ser configuradas em `EVOLUTION_EXISTING_DIR`.

Abra `http://127.0.0.1:8788`, faça login com o MASTER_ADMIN criado no bootstrap e configure os grupos na interface. A configuração pode começar vazia; nenhum JID real é hardcoded como requisito.

## Armazenamento

Os diretórios abaixo são criados quando necessários:

- `data/planilhas`: arquivos importados;
- `data/relatorio-os/saida`: artifacts e relatórios;
- `logs/inicializador`: logs do launcher;
- `logs/relatorio-os/listener`: logs do listener;
- `apps/central-os/data`: estado legado local, quando utilizado.

Uma instalação nova não copia `analysis-history.json`, `current-analysis.json`, `history-details` ou `current-import.json`. Esses arquivos pertencem ao legado local e não substituem o histórico PostgreSQL.

## Validação mínima

```powershell
cd apps/central-os
npm test
npm run check
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

Depois do primeiro start, confirme `/api/health`, `/api/persistence/health`, o estado da Evolution e o status do Listener. O Gate H em uma segunda máquina ou VM deve ser classificado separadamente de uma simulação isolada no PC atual.

Esta validação foi feita como GATE_H_CLEAN_ROOM_VALIDATED, usando isolamento temporário no PC atual. Isso não significa GATE_H_CLEAN_MACHINE_VALIDATED: uma máquina ou VM separada ainda exige uma validação própria.

## Backup e restauração

Para uma migração planejada, faça backup separado do banco `central_os`, dos artifacts necessários, de `config/app.env`, da configuração de grupos e dos volumes/sessão da Evolution. Não misture esses dados com o código nem com AWS/V3.

Para restaurar, pare a aplicação, confirme que o PostgreSQL e a Evolution estão disponíveis, restaure o banco `central_os` e os volumes/sessão correspondentes, recoloque `config/app.env` sem versioná-lo e execute as migrations pendentes. Depois inicie pelo launcher oficial e valide `/api/health`, `/api/persistence/health`, a Evolution e o Listener antes de liberar o uso.
