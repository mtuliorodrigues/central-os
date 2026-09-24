# Cronologia

1. **22/09/2026 — prévia somente leitura:** 17 OS passaram pelos filtros; o matching encontrou 14, separou 1 para revisão e não localizou 2.
2. **22/09/2026 — primeiro envio controlado:** revelou que a rota respondia sem comprovar persistência do forward.
3. **22/09/2026 — correção Evolution:** o forward passou a usar o pipeline padrão de envio e a resposta passou a ser validada pelo motor Python.
4. **22–23/09/2026 — testes unitários controlados:** o caminho direto da Evolution e depois o pipeline Python real confirmaram persistência e integridade UTF-8.
5. **23/09/2026 — lote controlado:** tentativas iniciais identificaram mensagens preexistentes e ajustaram a reconciliação sem reenvio automático.
6. **23/09/2026 — continuação reconciliada:** 4 itens já validados não foram reenviados; os 7 restantes foram processados sequencialmente e persistidos.
7. **23/09/2026 — revisão final:** os 11 itens elegíveis ficaram comprovados; o único ID extra da janela permaneceu não atribuído.
