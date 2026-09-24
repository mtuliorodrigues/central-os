# Central OS Local

Integração isolada entre **Central OS (Node.js)** e **Relatório OS (Python)**, preservando os dois motores especializados e reutilizando a infraestrutura Evolution/PostgreSQL/WhatsApp existente.

Frontend Production: [central-os-lake.vercel.app](https://central-os-lake.vercel.app). A interface publicada acessa o runtime local deste computador em `http://127.0.0.1:8788`; para dados e integrações reais, inicie primeiro `INICIAR_TUDO.bat`.

## Princípios

- uma interface para o usuário;
- dois motores independentes;
- uma infraestrutura compartilhada;
- projetos atuais intactos;
- nenhum `.env`, API key, planilha real, sessão ou dado operacional real no Git.

## Início rápido no Windows

1. Mantenha a estrutura do projeto inteira em uma pasta própria.
2. Execute `INICIAR_TUDO.bat`.
3. Abra `http://127.0.0.1:8788`.

Na fase 1, a aplicação reaproveita a Evolution/PostgreSQL existente. O inicializador pode subir **somente a stack existente** configurada em `EVOLUTION_EXISTING_DIR`; ele não cria outra Evolution, banco ou instância.

A execução real do relatório pelo painel está habilitada no runtime local após a validação do baseline. A confirmação do usuário continua obrigatória antes de qualquer envio:

```env
RELATORIO_ALLOW_WEB_EXECUTION=true
```

## Estrutura

- `apps/central-os/` — interface/API Node e motores atuais da Central OS.
- `apps/relatorio-os/` — listener e motor Python.
- `config/` — configuração integrada local (arquivo real ignorado pelo Git).
- `data/` — planilhas/saídas locais (dados reais ignorados pelo Git).
- `logs/` — logs operacionais.
- `scripts/` — inicialização, healthcheck, importação segura e captura de baseline.
- `infra/evolution/` — patch e build reproduzível da imagem Evolution `phase2-fix1`.
- `docs/` — arquitetura, portabilidade, baseline e relatório da etapa.

## Validação

Consulte `docs/ARQUITETURA_ATUAL.md`, `docs/PRODUCAO_VERCEL.md` e `docs/testes/fases/fase-2-relatorio-whatsapp/README.md` para arquitetura, operação, deploy e evidências sanitizadas.
