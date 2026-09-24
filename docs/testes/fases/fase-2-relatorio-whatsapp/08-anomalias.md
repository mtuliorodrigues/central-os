# Anomalias

## Evento não atribuído

ID: `3EB03A0C6BC5B323EAA538`.

O ID apareceu entre o baseline do destino e a reconciliação final. Ele já estava visível antes de seis dos sete forwards da continuação e não coincide com nenhum `destinationMessageId` devolvido pela Evolution para a Central OS.

Não há evidência para atribuí-lo ao pipeline da Central OS. O evento permanece documentado como **não atribuído**, sem ser apagado, reclassificado ou usado para reprovar os sete forwards individualmente comprovados.

## Harness PowerShell anterior

Um teste anterior substituiu caracteres acentuados por `U+FFFD` antes do envio. Isso foi isolado no harness PowerShell; o pipeline Python real preservou serialização, texto e SHA-256. Nenhum reenvio foi feito apenas para ocultar esse resultado.
