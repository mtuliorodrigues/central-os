# Central OS — Ambiente Cloud AWS

## Fase 2A — arquitetura greenfield

Este documento descreve a implantação futura do **Ambiente Cloud AWS da Central OS**. Ele não provisiona recursos, não reutiliza a AWS legada e não altera a Vercel existente.

```text
Usuário
  │ HTTPS
  ▼
CloudFront (URL própria)
  ├── /*     → S3 privado + OAC → build React/Vite
  └── /api/* → VPC Origin → EC2 privada:8080
                              └── reverse-proxy
                                  └── central-os-backend:8788
                                      ├── PostgreSQL central_os
                                      ├── Redis
                                      ├── Evolution:8080
                                      └── relatorio-os-worker:8090
                                          └── Listener Python (única instância)
```

O frontend AWS usará `/api` como base relativa. A Vercel continua sendo um ambiente separado e fica explicitamente fora desta arquitetura: `VERCEL_NOT_PART_OF_AWS_ARCHITECTURE`.

## CloudFront e SPA

Haverá uma distribuição nova, com dois origins:

| Behavior | Origin | Política |
|---|---|---|
| `*` | S3 REST privado | OAC, HTTPS, cache de frontend |
| `/api/*` | VPC Origin → EC2 privada → reverse proxy | `CachingDisabled`, Authorization, query strings e métodos necessários encaminhados |

HTTP redireciona para HTTPS. A CloudFront Function `infra/aws/cloudfront/spa-rewrite.js` reescreve somente rotas React sem extensão para `/index.html`. Caminhos `/api` e arquivos com extensão ficam intactos; não existe custom error global que transforme erro da API em HTML.

`index.html` terá TTL curto ou invalidação no deploy. Assets com hash terão TTL longo e `immutable`.

## Rede

Será criada uma VPC nova, parametrizada por região, com duas AZs:

- subnets públicas: NAT Gateway e saída pelo Internet Gateway;
- subnets privadas: EC2 sem IPv4 público e sem SSH público;
- Security Group da aplicação: somente o ingresso do VPC Origin no reverse proxy;
- PostgreSQL, Redis, Evolution e worker sem publicação externa.

O NAT atende Baileys/WhatsApp, pull do ECR, S3, Secrets Manager, CloudWatch, SSM, DNS e atualizações. VPC endpoints serão avaliados depois por custo e benefício.

ALB não faz parte do primeiro desenho. Ele será considerado quando houver múltiplas EC2, necessidade de health routing independente, deploy rolling ou escala horizontal.

## Serviços e persistência

O Compose executável está em `infra/aws/docker-compose.cloud.yml`.

| Serviço | Porta interna | Persistência | Healthcheck |
|---|---:|---|---|
| `reverse-proxy` | 8080 | configuração read-only | dependência do backend |
| `central-os-backend` | 8788 | data, logs, config | `/api/health` |
| `relatorio-os-worker` | 8090 | planilhas, reports, logs, config | `/health` |
| `listener` | — | logs/config | profile opcional |
| `evolution` | 8080 | volume de instâncias | `/` |
| `postgres` | 5432 | volume novo | `pg_isready` |
| `redis` | 6379 | volume novo | `redis-cli ping` |

Na topologia cloud oficial, `relatorio-os-worker` e `listener` são serviços independentes usando a mesma imagem Python. O worker recebe `RELATORIO_START_LISTENER=false`, portanto nunca cria um filho; o serviço `listener` é a única instância operacional do processo Python de WhatsApp. Isso evita duplicação e permite restart/observabilidade separados.

O PostgreSQL cloud terá databases `central_os` e `evolution`, com roles separadas. O Redis será novo e vazio. Nenhum banco ou volume local será copiado.

O script `infra/aws/postgres/init/10-create-databases.sh` cria databases/roles de forma idempotente na primeira inicialização. As senhas chegam por injeção de ambiente/Secrets Manager e nunca ficam no arquivo versionado. As migrations do Central OS rodam como etapa explícita de bootstrap após o healthcheck do PostgreSQL, sem confundir processo iniciado com banco pronto.

Layout do EBS de dados:

```text
/srv/central-os/postgres
/srv/central-os/evolution
/srv/central-os/planilhas
/srv/central-os/reports
/srv/central-os/logs
/srv/central-os/backups
/srv/central-os/config
```

Baseline: root EBS gp3 de 30 GiB e data EBS gp3 criptografado de 100 GiB, com `deleteOnTermination=false` para o volume de dados.

## Imagens e Evolution

Repositórios ECR planejados:

- `central-os/backend`
- `central-os/relatorio-os`
- `central-os/evolution`

Tags serão imutáveis, com scan on push e lifecycle policy. A Evolution será construída a partir da upstream `2.3.7`, commit `cd800f2976e1e5b682fbf86a01ee4d85ae61f370` e patch versionado. A imagem futura será `central-os/evolution:2.3.7-phase2-fix1`.

Estado: `PENDING_REAL_WHATSAPP_VALIDATION`.

O pairing será obrigatoriamente novo: nova instância, QR, sessão, volumes e banco Evolution. A sessão local jamais será exportada ou reutilizada.

Gate posterior: `connectionStatus=open`, grupos/JIDs confirmados, histórico de 12 dias e encaminhamento controlado.

## S3, segredos e IAM

Serão dois buckets independentes:

- frontend: Block Public Access, leitura somente pelo OAC;
- backup: Block Public Access, versionamento, criptografia e lifecycle.

Nenhum segredo entra em Git, Dockerfile, S3 frontend, `VITE_*` ou CloudFront Function. Secrets Manager armazenará credenciais de banco, Evolution, sessão cloud e autenticação da aplicação.

A Instance Role terá somente permissões para pull no ECR, secrets específicos, backup S3, logs CloudWatch e Session Manager. Não haverá access key fixa. A administração será feita por SSM; porta 22 não é necessária.

## Backup, restore e observabilidade

Backups previstos:

- `pg_dump central_os` → S3;
- `pg_dump evolution` cloud → S3;
- snapshots EBS;
- runbook de restore com RPO/RTO documentados antes do cutover.

RPO inicial proposto: 24 horas para dados operacionais. RTO inicial proposto: 4 horas. Nenhum backup será considerado validado sem restore futuro em ambiente separado.

Logs dos containers irão para stdout/stderr com rotação Docker e, depois, CloudWatch para backend, worker, listener, Evolution e erros relevantes do PostgreSQL. Retenção inicial proposta: 30 dias.

Alarmes e painéis devem acompanhar CPU/status da EC2, RAM, disco, health dos containers, `/api/health`, `/api/persistence/health`, erros 4xx/5xx do CloudFront e latência do origin.

## WebSocket/SSE

O código atual não confirmou consumidor browser de WebSocket, SSE ou long polling para a operação principal. Estado: `NONE_CONFIRMED`. A Evolution não será publicada para suportar esse caso.

## Migração e rollback

Migrar futuramente somente `central_os` e artefatos necessários, com exportação controlada e validação de integridade.

Não migrar: banco Evolution atual, Redis atual, sessão WhatsApp, JSON legado e sessões de login.

Rollback antes do pairing: desligar a nova stack e manter o ambiente local intacto. Rollback depois do pairing: parar o tráfego no CloudFront, preservar volumes cloud para investigação e voltar ao ambiente anterior sem reutilizar a sessão cloud em outro ambiente.

## Regiões e custo indicativo

| Critério | `us-east-1` | `sa-east-1` |
|---|---|---|
| Compute/EBS/NAT | menor custo e maior disponibilidade de serviços | maior custo, menor distância física do Brasil |
| API para usuários no Brasil | CloudFront reduz impacto do origin | menor latência direta do origin |
| VPC Origin | suportado no desenho | suportado no desenho |
| Escolha inicial | recomendada por custo | alternativa por latência/compliance |

Estimativa inicial de baixo tráfego em `us-east-1`: aproximadamente US$110–125/mês antes de impostos e crescimento, incluindo EC2, EBS, NAT/IPv4, CloudFront, S3, ECR, Secrets, CloudWatch e snapshots. É uma estimativa de planejamento, não cotação.

## IaC e validação

`infra/aws/cdk` contém a estrutura CDK TypeScript para síntese local. O código é um esqueleto de desenho e inclui placeholders explícitos para AMI, origin VPC e permissões finais; não deve ser aplicado sem revisão de segurança.

Validações locais desta fase:

- `docker compose config` com env sintético;
- builds dos containers;
- `cdk synth`;
- testes da CloudFront Function;
- testes conceituais de rewrite/API;
- secrets scan;
- `git diff --check`.

Não foram executadas APIs AWS mutáveis.

## Gates e próximo estágio

- `EVOLUTION_SECURITY_GATE`: pendente; baseline atual de runtime: 83 vulnerabilidades (54 moderate, 26 high, 3 critical).
- `PENDING_REAL_WHATSAPP_VALIDATION`: pendente.
- CloudFront VPC Origin e IAM finais precisam de revisão antes de qualquer deploy.

O próximo passo seguro é revisar os artefatos localmente e executar somente síntese/validações. Provisionamento, ECR push, pairing e deploy exigem autorização separada.

## Parâmetros fechados no Gate 2B

- `DEFAULT_REGION=us-east-1`;
- AMI: Amazon Linux 2023 x86_64 resolvida pelo parâmetro público SSM `/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64`, sem pinning de AMI antiga;
- EC2 inicial: `t3a.large` (2 vCPU, 8 GiB), parametrizável para rightsizing posterior;
- data device: `/dev/xvdf`, XFS, montado em `/srv/central-os`, com detecção idempotente de volume novo versus volume já formatado;
- root device: `/dev/xvda`, 30 GiB gp3;
- dados: `/dev/xvdf`, 100 GiB gp3 criptografado, preservado na terminação.

O único parâmetro regional de implantação é `CloudFrontOriginPrefixListId`, que recebe o prefix list gerenciado da AWS. A AMI AL2023, o ARN da EC2, o DNS privado e o VPC Origin são derivados pela própria stack. Não há `TODO`, `FIXME`, dummy ou valor de produção oculto.

Secrets Manager terá três nomes conceituais: `/central-os/database`, `/central-os/evolution` e `/central-os/auth`. O backend recebe `DATABASE_URL` e autenticação; Evolution recebe sua URI PostgreSQL, Redis e API key; o worker/listener recebe somente os campos Evolution e seus diretórios operacionais.
