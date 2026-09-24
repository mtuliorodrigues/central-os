# Fase 2 — Relatório OS + WhatsApp

Estado: **FUNCTIONALLY APPROVED**.

Esta pasta registra a validação ponta a ponta do fluxo `planilha -> filtros -> matching -> histórico WhatsApp -> forward -> persistência`. Os artefatos brutos permanecem apenas no diretório operacional ignorado pelo Git, pois contêm dados de clientes, grupos e mensagens.

Resultado consolidado:

- 17 OS após os filtros;
- 14 correspondências automáticas, 1 para revisão e 2 não localizadas;
- teste controlado pelo pipeline Python real aprovado;
- 11 mensagens elegíveis do lote validadas, sendo 4 previamente confirmadas e 7 processadas na continuação final;
- 11/11 forwards confirmados e persistidos;
- zero duplicações criadas pelo lote;
- conteúdo, SHA-256, UTF-8 e acentos preservados em cada mensagem validada;
- evento `3EB03A0C6BC5B323EAA538` mantido como não atribuído.

Não repita o lote completo como smoke test. Use os testes isolados e os healthchecks descritos em `10-reprodutibilidade.md`.
