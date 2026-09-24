# Testes unitários e controlados

Os testes versionados em `apps/relatorio-os/test/test_matching.py` cobrem:

- empate entre mensagens fortes resulta em `REVISAR`;
- uma mensagem forte e única resulta em `ENCONTRADA`;
- forward só é aceito com ID confirmado e destino correto;
- resposta HTTP sem ID confirmado é rejeitada.

Comando isolado:

```powershell
cd C:\Central OS\apps\relatorio-os
.\.venv\Scripts\python.exe -m unittest discover -s test -p "test_*.py" -v
```

O teste controlado real do pipeline Python gerou uma única mensagem de destino, encontrou o ID retornado, comparou o texto integral e confirmou SHA-256 idêntico, sem `U+FFFD` na origem ou no destino.
