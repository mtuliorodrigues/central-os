# Itens ignorados e mensagens preexistentes

O mecanismo de segurança não reenviou itens que já tinham evidência suficiente no destino. A continuação final recebeu uma lista explícita de quatro itens previamente validados e processou apenas os sete restantes.

Foram identificadas 17 cópias duplicadas preexistentes em três conteúdos antes da continuação. Elas não foram criadas pela execução reconciliada. Para cada item processado, o harness comparou a contagem exata antes e depois e aceitou apenas incremento unitário associado ao ID devolvido.

Política preservada:

- no máximo uma tentativa de forward por OS em cada execução;
- sem retry automático;
- preexistência não é atribuída ao lote atual;
- qualquer ambiguidade de matching vai para revisão;
- a confirmação exige o ID de destino devolvido pela Evolution.
