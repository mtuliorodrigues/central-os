# Relatório de implementação — Etapa 1

Data: 2026-09-22

## Escopo e isolamento

A implementação foi feita exclusivamente em um repositório Git local novo e isolado: `central-os-integrada`.
Nenhum write foi feito nos projetos atuais. A fase 1 reutiliza a Evolution/PostgreSQL existente e a instância `sgp-whatsapp`; não cria outra stack, banco, instância ou volume.

O conector GitHub disponível nesta execução não expõe criação de repositório, então o remoto `central-os-integrada` ainda não foi criado. O histórico Git local está pronto para publicação.

## Commits realizados

- `595f8fa` — chore: criar estrutura isolada e registrar baseline A-J
- `3f60294` — chore: importar snapshot do runtime Relatório OS
- `1ece83e` — chore: importar snapshot do núcleo Central OS
- `0f91678` — feat: tornar configuração e caminhos portáveis
- `8c6156a` — feat: criar bridge Node para Relatório OS e healthchecks
- `e640eaf` — feat: integrar painel Relatório OS ao dashboard
- `230dae1` — feat: adicionar inicializador único e healthchecks
- `81ad3df` — chore: remover identificadores reais do código versionado
- `7679244` — test: validar bridge e fluxos funcionais simulados
- `14b3d82` — test: ampliar validação funcional da integração
- `ed348ee` — docs: consolidar entrega e captura de baseline
- `6634402` — fix: contar apenas listeners Python reais
- `59eb74a` — chore: restaurar auxiliares do frontend Central OS

## Arquitetura efetiva

```text
Dashboard Central OS (Node.js, porta integrada padrão 8788)
            |
            +-- motores originais da Central OS
            |     +-- importação XLSX/CSV
            |     +-- análise/classificação
            |     +-- histórico/grupos via PostgreSQL Evolution
            |
            +-- relatorio-bridge.js (orquestração, sem regra de negócio)
                  +-- healthchecks Docker/PostgreSQL/Evolution/WhatsApp
                  +-- status/config/logs/planilhas
                  +-- lock de execução
                  +-- chama motor_relatorio_os.py sob demanda
                  +-- observa listener Python separado

Listener Python permanente
            |
            +-- motor_relatorio_os.py sob demanda

Infraestrutura compartilhada existente
            +-- Evolution API :8080
            +-- evolution_postgres
            +-- sgp-whatsapp
```

## Preservação dos motores

- `motor_relatorio_os.py`: preservado byte a byte em relação ao runtime materializado de referência.
  - SHA-256: `4db94c2898d2527b2711b81faa451fd1273bb137920245a65ed9a973e5fe5fb0`.
- Listener: lógica de comandos/matching preservada; foram alterados somente caminhos/configuração para portabilidade e extração de um identificador privado hardcoded para variável de ambiente.
- `analyzer.js`, `possibly-closed.js` e `spreadsheet-import.js`: preservados como motores da Central OS; integração feita ao redor deles.

## Arquivos/componentes principais criados ou adicionados

- `INICIAR_TUDO.bat`
- `scripts/start.ps1`
- `scripts/healthcheck.ps1`
- `scripts/IMPORTAR_CONFIG_LOCAL.ps1`
- `scripts/IMPORTAR_PLANILHAS_LOCAIS.ps1`
- `scripts/CAPTURAR_BASELINE_ATUAL.ps1`
- `config/app.env.example`
- `apps/central-os/src/integrated-env.js`
- `apps/central-os/src/relatorio-bridge.js`
- `apps/central-os/test/relatorio-bridge.test.js`
- `apps/central-os/test/fake-infra/*`
- `apps/relatorio-os/requirements.txt`
- exemplos de configuração de grupos/usuários sem dados reais
- documentação em `docs/`

## Arquivos adaptados na cópia

- `apps/central-os/src/server.js`: carrega configuração integrada e expõe endpoints do Relatório OS/healthcheck.
- `apps/central-os/index.html`: painel “Em construção” substituído pelo painel real do Relatório OS.
- `apps/central-os/dashboard.js`: status/planilhas/execução do Relatório OS.
- `apps/central-os/styles.css`: estilos do painel integrado.
- `apps/central-os/.env.example`: identificadores reais removidos.
- `apps/central-os/src/index.js`: JID piloto real removido do fallback.
- `apps/relatorio-os/src/COMANDO_WHATSAPP_RELATORIO_USUARIOS.py`: apenas paths/configuração portáveis e segredo opcional movido para env.
- `apps/relatorio-os/.env.example`: configuração local segura.

## Endpoints adicionados

- `GET /api/relatorio/status`
- `GET /api/relatorio/config`
- `GET /api/relatorio/logs`
- `GET /api/relatorio/planilhas`
- `POST /api/relatorio/executar`
- `GET /api/health`

A execução web nasce bloqueada (`RELATORIO_ALLOW_WEB_EXECUTION=false`) até o baseline real no Windows/WhatsApp ser validado.

## Proteções implementadas

- projetos atuais não são sobrescritos/movidos;
- sem nova Evolution/PostgreSQL/instância;
- sem movimentação de volumes;
- `.env`, configs reais, planilhas, logs, `.venv` e `node_modules` ignorados pelo Git;
- identificadores reais hardcoded removidos dos arquivos versionados da integração;
- listener duplicado detectado e não iniciado;
- mais de um listener é tratado como erro no inicializador/healthcheck;
- lock persistente impede duas execuções do relatório simultâneas;
- execução pelo dashboard desabilitada por padrão;
- PostgreSQL exige `SELECT 1`, não apenas container aberto;
- WhatsApp exige `state=open|connected`, não apenas HTTP 200 da Evolution;
- Central OS é considerada funcional pelo endpoint, não só por porta aberta.

## Baseline A–J

O baseline documental/código foi registrado em `docs/baseline/BASELINE_A_J.md` antes das alterações funcionais.
O baseline funcional do sistema original não pôde ser executado nesta sessão porque o ambiente de execução não possui acesso ao Windows/Docker/WhatsApp local do usuário.

Para capturar a parte automatizável no computador real, foi adicionado `scripts/CAPTURAR_BASELINE_ATUAL.ps1` (somente leitura). Os itens C/E continuam exigindo confirmação manual no WhatsApp.

## Testes executados e aprovados

### Estáticos/unitários

- `node --check` em todos os arquivos JS relevantes: PASS.
- `python -m py_compile` no motor e listener: PASS.
- `git diff --check`: PASS.
- `npm test`: 11/11 PASS.
  - importação CSV;
  - matching/classificação;
  - isolamento entre grupos;
  - remetente sem pushName;
  - normalização do estado WhatsApp;
  - configuração ausente sem inventar grupos;
  - paths portáveis;
  - execução web bloqueada por padrão;
  - healthcheck estruturado;
  - lock de execução.

### Funcionais com infraestrutura simulada

- `DASHBOARD_AND_HEALTH_ENDPOINT=PASS`
- `CENTRAL_OS_FAKE_E2E=PASS`
  - servidor real da cópia;
  - dashboard servido;
  - importação de CSV sintético;
  - leitura de PostgreSQL simulado;
  - OS localizada;
  - classificação `possivelmente_realizada`.
- `BRIDGE_TO_REAL_MOTOR_FAKE_EVOLUTION=PASS`
  - endpoint real `/api/relatorio/executar`;
  - bridge real;
  - motor Python real da cópia;
  - resumo pós-filtros/encontradas/enviadas validado.
- `MOTOR_REAL_FAKE_EVOLUTION=PASS`
  - motor localizou a mensagem e chamou forward com destino esperado.
- `LISTENER_COMMAND_TO_MOTOR_FAKE_E2E=PASS`
  - comando `!relatorio` recebido pelo listener real;
  - listener chamou o motor real;
  - forward executado na Evolution simulada;
  - confirmação `Relatório concluído` enviada.

Esses testes provam comportamento de integração, mas não substituem a validação da sessão WhatsApp e grupos reais.

## Testes que não puderam ser aprovados aqui

Não foram marcados como aprovados:

- conexão com o Docker Desktop real do computador do usuário;
- `SELECT 1` no `evolution_postgres` real;
- estado real da instância `sgp-whatsapp`;
- comando vindo do WhatsApp real;
- encaminhamento visível no grupo de destino real;
- paridade numérica A–J com uma planilha real conhecida;
- reboot do Windows seguido de `INICIAR_TUDO.bat`;
- portabilidade física para outra pasta/unidade no Windows;
- instalação real das dependências em máquina limpa.

## Inicialização no Windows

1. Copiar/clonar `central-os-integrada` para uma pasta própria (ex.: `C:\CentralOS-Integrada`).
2. Executar `INICIAR_TUDO.bat`.
3. O script cria `config/app.env` a partir do exemplo quando necessário.
4. `IMPORTAR_CONFIG_LOCAL.ps1` copia `.env`, grupos e usuários do runtime atual para a cópia **sem alterar a origem**.
5. O inicializador reaproveita a stack Evolution existente, valida PostgreSQL e `sgp-whatsapp`, cria a `.venv`, instala dependências se necessário, garante listener único e inicia a Central OS integrada.
6. Painel padrão: `http://127.0.0.1:8788`.

A execução de relatório pelo botão permanece bloqueada até alterar localmente `RELATORIO_ALLOW_WEB_EXECUTION=true` depois da validação manual.

## Logs

- inicializador: `logs/inicializador/`
- listener: `logs/relatorio-os/listener/`
- saídas do motor: `data/relatorio-os/saida/`
- Central OS Node: `logs/central-os/`
- baseline local: `logs/baseline/`

## Rollback

Rollback é parar a aplicação integrada e voltar a iniciar os projetos atuais pelos inicializadores que já existiam. Como esta etapa não moveu nem sobrescreveu arquivos, bancos, volumes ou sessão, não existe migração destrutiva para desfazer.

## Pendências para aceitação final

1. Criar o repositório remoto `central-os-integrada` e publicar o histórico Git local.
2. Rodar `CAPTURAR_BASELINE_ATUAL.ps1` no Windows e anexar o resultado.
3. Fazer C/E manualmente: comando real e confirmação visual de encaminhamento.
4. Copiar uma planilha real de referência para a integração e comparar os totais com o baseline original.
5. Executar `INICIAR_TUDO.bat` após reboot completo.
6. Testar cópia para outra pasta/unidade.
7. Só então habilitar `RELATORIO_ALLOW_WEB_EXECUTION=true` para uso do botão de execução em produção.
