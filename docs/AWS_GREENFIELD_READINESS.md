# Ambiente Cloud AWS da Central OS — readiness greenfield

Este documento prepara uma implantação nova. Nenhum recurso AWS legado é reutilizado automaticamente e nenhum recurso é provisionado por esta etapa.

## Arquitetura alvo

```text
Vercel
  -> HTTPS / hostname da API
  -> reverse-proxy (ALB ou Nginx)
  -> central-os-backend :8788
       -> PostgreSQL central_os
       -> Evolution :8080
  -> relatorio-os-worker :8090
       -> listener Python
       -> Evolution :8080
Evolution :8080 -> PostgreSQL evolution + Redis
```

Serviços previstos para um Compose de referência ou tarefas ECS equivalentes:

| Serviço | Imagem/build | Porta | Persistência | Dependências | Healthcheck |
| --- | --- | --- | --- | --- | --- |
| `central-os-backend` | `apps/central-os/Dockerfile` | 8788 | `/srv/central-os/data`, `/srv/central-os/logs` | PostgreSQL `central_os`, Evolution | `/api/health` |
| `relatorio-os-worker` | `apps/relatorio-os/Dockerfile` | 8090 | planilhas, reports, logs, config | Evolution | `/health` |
| `evolution` | imagem nova derivada do fonte upstream + patch aprovado | 8080 | sessão em volume novo | PostgreSQL `evolution`, Redis | endpoint de saúde da Evolution |
| `postgres` | `postgres:15` inicialmente | 5432 interno | volume novo | — | `pg_isready` |
| `redis` | `redis:7-alpine` inicialmente | 6379 interno | volume novo, AOF | — | `redis-cli ping` |
| `reverse-proxy` | Nginx/ALB | 443 | nenhuma | backend | HTTPS/target health |

Todos os serviços devem usar restart policy equivalente a `unless-stopped`/ECS service restart, uma rede privada comum e portas internas. Apenas o reverse proxy deve ser público.

## Node

O Dockerfile Linux foi criado em `apps/central-os/Dockerfile`. Ele usa `npm ci`, compila o Vite em estágio separado, executa como usuário não-root, escuta em `0.0.0.0:8788` e possui healthcheck. Configuração é somente por ambiente; o arquivo `config/app.env` não entra na imagem.

## Python

O Dockerfile Linux foi criado em `apps/relatorio-os/Dockerfile`. Ele instala `requirements.txt`, inclui `rapidfuzz`, `pandas`, `openpyxl`, motor e listener, executa como usuário não-root e expõe o worker em `8090`. Os caminhos cloud usam `/srv/central-os`; nenhum caminho `C:\` é necessário.

## Evolution

O patch `infra/evolution/patches/evolution-api-2.3.7-phase2-fix1.patch` e o manifesto estão versionados e descrevem o forward nativo usado localmente. A imagem atual foi construída a partir de `C:\EvolutionSGP\evolution-forward-src`, que não está no repositório e não possui origem remota/pinada declarada nesta etapa. Portanto:

**EVOLUTION_CLOUD_IMAGE_BLOCKED** até que o fonte upstream e seu commit base estejam acessíveis por build reproduzível em Linux/CI. A sessão WhatsApp local não será copiada.

## PostgreSQL e Redis novos

Criar uma implantação nova com volume novo. O PostgreSQL deverá conter:

- database `evolution`, usado somente pela Evolution;
- database `central_os`, com migrations da Central OS;
- roles separadas, sem usar a role administrativa no runtime.

O Redis deverá iniciar vazio em volume novo. Backup lógico e restore precisam ser testados antes do cutover. O banco Evolution atual e os dados Redis atuais não serão migrados.

## Storage Linux

Layout planejado:

```text
/srv/central-os/
  postgres/
  evolution/
  planilhas/
  reports/
  logs/
  backup-staging/
  config/
```

Planilhas, reports, logs, configuração de grupos e sessão Evolution devem ter políticas de retenção e backup separadas. A sessão não será exportada da máquina local.

## Secrets

Futuras entradas do Secrets Manager:

- `CENTRAL_OS_DATABASE_URL` ou componentes de conexão;
- senha da role de aplicação `central_os`;
- credenciais da role da Evolution;
- `AUTHENTICATION_API_KEY` da Evolution;
- `RELATORIO_TEAMO_CONTATO`, se habilitado;
- demais valores operacionais privados.

Nenhum secret deve estar em imagem, Git ou variável `VITE_*`. A injeção deve ocorrer no lançamento do serviço, usando roles IAM distintas para execução e aplicação.

## HTTPS e frontend

Hostname futuro: `api.<dominio>` (a definir). O tráfego será Vercel → HTTPS → reverse proxy → Node. O certificado deve ser gerenciado por ACM quando houver ALB. O CORS aceitará somente o domínio Vercel e origens administrativas explicitamente aprovadas. `/api/health` será público e sanitizado; endpoints operacionais continuarão autenticados.

O `VITE_API_URL` mudará de `http://127.0.0.1:8788` para `https://api.<dominio>` apenas numa etapa posterior. A produção atual não foi alterada.

## Migração e cutover

Migrar somente:

- schema/dados aprovados do `central_os`;
- artifacts necessários, após classificação e backup.

Não migrar:

- sessão Evolution;
- database Evolution atual;
- Redis atual;
- JSON legado de histórico;
- sessão de login da aplicação.

O cutover inclui obrigatoriamente criar uma instância Evolution nova, parear um WhatsApp novo por QR Code, validar grupos/JIDs e só então executar o teste controlado. Nenhuma sessão local será reutilizada.

## Rollback

Antes do pairing: manter o ambiente local intacto e apontar o frontend para o runtime local.

Depois do pairing: interromper o tráfego para a API cloud, preservar a sessão cloud para investigação, restaurar o frontend para a API local e não tentar reutilizar a sessão cloud no ambiente local. Qualquer retorno à cloud exige novo healthcheck, autenticação, grupos e teste controlado.

## Riscos e próximos gaps

1. Fonte remoto/pinado da Evolution ainda precisa ser definido.
2. Compose cloud/definições ECS, reverse proxy, TLS, IAM, ECR e observabilidade ainda não foram criados.
3. Tamanho e política de retenção dos volumes cloud ainda precisam de dimensionamento.
4. O hostname final da API ainda não foi escolhido.
5. A migração de `central_os` precisa de procedimento de dump/restore validado.

Nenhuma mutação AWS, deploy, pairing ou alteração de código operacional foi realizada nesta fase.
