# Lote completo

O universo tinha 14 mensagens localizadas automaticamente. Três foram usadas nas validações controladas, restando 11 para a validação de lote.

Resultado consolidado dos 11 itens:

- 4 já validados e deliberadamente não reenviados na continuação;
- 7 enviados sequencialmente na continuação final;
- 11 com forward e persistência confirmados no conjunto das execuções;
- 7/7 itens da continuação com `destinationMessageId`, texto exato, hash idêntico e UTF-8 íntegro;
- zero retries automáticos;
- zero duplicações criadas pela continuação;
- uma mensagem extra observada na janela, tratada separadamente em `08-anomalias.md`.

O harness marcou a reconciliação final como `FAILED` por regra conservadora ao encontrar esse ID extra. A revisão dos sete retornos da Evolution e das sete verificações individuais mostrou que todos os forwards da Central OS foram corretos. Por isso o estado funcional aprovado não atribui o evento extra ao lote.
