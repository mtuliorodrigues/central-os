# Histórico operacional da Central OS Local

A Fase 7A inicia o registro próprio do fluxo `Import → Execution → ExecutionItem → Report` para novas operações. Os arquivos legados (`current-import.json`, `current-analysis.json`, `analysis-history.json` e `history-details`) continuam preservados e não são migrados.

O `ImportDialog` atual mantém o fluxo legado `importar → analisar`; nesta fase, a validação import-only foi feita diretamente pelo endpoint para não iniciar matching nem criar uma Execution. A UX não é alterada nesta rodada. No runtime observado, `current-import.json` não existia; essa compatibilidade deve ser reavaliada na Fase 7B.

## Fontes de verdade

O motor Python continua sendo a fonte dos filtros, exclusões, matching, classificações, contagens, encaminhamento e artefatos. O Node gera `importId`/`executionId`, coordena a chamada e grava o contrato JSON produzido pelo Python. O Node não recalcula contadores nem matching.

`imports.rowCount` representa as linhas úteis registradas pelo parser de importação. `executions.rowsRead` representa as linhas efetivamente lidas pelo motor Python; os valores podem divergir.

## Datas e duplicidade

`importedAt` é o momento em que a Central OS recebeu o arquivo. `generatedAt` só é preenchido quando confirmado pelo usuário, com `generatedAtSource` e `generatedAtConfidence`; os timestamps são armazenados em UTC e apresentados pelo cliente em horário local. O mesmo SHA-256 pode ser importado novamente e retorna uma referência informativa ao import anterior.

## Consistência

Uma execution é criada como `running` antes do motor iniciar. A finalização grava itens, relatórios, contadores oficiais e status na mesma transação. Se o motor ou a persistência falhar, a execution permanece registrada como `failed` com resumo sanitizado.

## APIs autenticadas

`GET /api/imports`, `GET /api/imports/:id`, `GET /api/imports/:id/executions`, `GET /api/executions/:id`, `GET /api/executions/:id/items` e `GET /api/executions/:id/reports` expõem somente metadados operacionais, sem hashes de senha, tokens, payload bruto da Evolution ou mensagens completas.
