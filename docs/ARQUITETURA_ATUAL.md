# Arquitetura atual da Central OS Local

## Produto

A Central OS Local é um único produto operacional com dois motores separados:

- `apps/central-os`: backend Node.js, API, análise e frontend React;
- `apps/relatorio-os`: motor Python e listener de comandos do WhatsApp;
- Evolution API: transporte, histórico e persistência de mensagens;
- PostgreSQL e Redis: infraestrutura da Evolution;
- Vercel: hospedagem estática do frontend React.

## Fluxo local

`INICIAR_TUDO.bat` executa `scripts/start.ps1`, que valida ou inicia a stack externa em `C:\EvolutionSGP\evolution`, exige a imagem `evolution-api-forward-sync-direct:2.3.7-phase2-fix1`, confirma bancos e sessão, inicia o backend Node e garante um único listener independente.

O backend escuta somente em `127.0.0.1:8788`. A Evolution publica somente `127.0.0.1:8080`. Segredos, sessões, bancos, planilhas, saídas e logs permanecem locais e ignorados pelo Git.

## Fluxo do Relatório OS

`planilha -> filtros -> matching -> histórico do grupo de origem -> forward nativo -> confirmação do ID de destino -> persistência -> relatório/logs`.

Ambiguidades não são enviadas automaticamente. A execução pelo painel está habilitada no runtime local e mantém confirmação explícita antes do envio, com `RELATORIO_ALLOW_WEB_EXECUTION=true` no arquivo local ignorado pelo Git.

## Frontend Production

O projeto Vercel `tulio-s-org/central-os` constrói `apps/central-os/frontend` e publica o mesmo React usado localmente. O modo `local-runtime` usa `http://127.0.0.1:8788` como API. Assim, cada navegador acessa o runtime do próprio computador.

O site e os assets continuam disponíveis quando o runtime está desligado; dados, status e ações exibem indisponibilidade até o inicializador local estar ativo.

## Limite da arquitetura

Não há backend, banco, Evolution ou sessão WhatsApp na Vercel. A URL pública não transforma o runtime local em serviço público e não permite operar a Central OS a partir de outro computador sem que esse computador também tenha o runtime instalado e iniciado.
