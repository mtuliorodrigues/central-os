# Teste Python ponta a ponta

O teste final controlado chamou `motor_relatorio_os.forward_original_record` com uma mensagem real previamente selecionada e um destino de teste já configurado.

Foi comprovado:

- status HTTP de criação;
- `destinationMessageId` presente;
- `remoteJid` igual ao destino esperado;
- crescimento de exatamente uma mensagem no destino;
- uma ocorrência do ID retornado;
- uma ocorrência exata do texto;
- tamanhos de origem e destino iguais;
- SHA-256 de origem e destino iguais;
- ausência do caractere de substituição `U+FFFD`.

O artefato bruto permanece local e é referenciado por hash no inventário. Nenhum dado da mensagem foi copiado para o Git.
