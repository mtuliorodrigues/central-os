# Evolution API `phase2-fix1`

A Central OS Local usa a Evolution API 2.3.7 com um patch pequeno para encaminhamento nativo e sincronização de histórico. O patch está versionado neste diretório; credenciais, sessão WhatsApp, banco e `.env` continuam somente no ambiente operacional.

## Reconstrução isolada

```powershell
powershell -ExecutionPolicy Bypass -File .\infra\evolution\build-phase2-fix1.ps1
```

O script cria um worktree temporário no commit base, aplica o patch, usa o `Dockerfile` oficial daquele commit e produz a imagem `evolution-api-forward-sync-direct:2.3.7-phase2-fix1`. A árvore oficial em `C:\EvolutionSGP\evolution-forward-src` não é alterada.

O manifesto registra o commit base e os hashes do patch, `Dockerfile`, `package.json` e `package-lock.json`. Para selecionar a imagem no compose existente, use o override de exemplo ou mantenha a mesma tag no `docker-compose.yml` operacional.

## Comportamento preservado

- `POST /message/forwardMessage/{instance}` encaminha a mensagem original pelo pipeline padrão de envio, que persiste e emite os eventos normais;
- a resposta confirma `key.id` e `key.remoteJid`;
- `POST /chat/syncHistory/{instance}` solicita histórico sob demanda para a mensagem informada;
- o motor Python rejeita sucesso HTTP sem ID de destino ou com destino divergente.
