# Reprodutibilidade

## Testes sem WhatsApp real

```powershell
cd C:\Central OS\apps\relatorio-os
.\.venv\Scripts\python.exe -m unittest discover -s test -p "test_*.py" -v
```

## Reconstruir a Evolution

```powershell
cd C:\Central OS
powershell -ExecutionPolicy Bypass -File .\infra\evolution\build-phase2-fix1.ps1
```

O build usa um worktree temporário no commit oficial, aplica o patch e produz `evolution-api-forward-sync-direct:2.3.7-phase2-fix1`.

## Validar o runtime sem processar OS

```powershell
cd C:\Central OS
.\INICIAR_TUDO.bat
powershell -ExecutionPolicy Bypass -File .\scripts\healthcheck.ps1 -Json
```

O healthcheck exige Docker, PostgreSQL, Redis, Evolution, imagem aprovada, WhatsApp conectado, configuração local, um listener e backend Node. Ele não executa lote de OS.

## Regra de segurança

Não use os harnesses operacionais antigos como teste recorrente. Eles contêm referências reais e uma execução pode encaminhar mensagens. Para uma nova validação real, crie um caso controlado explicitamente autorizado.
