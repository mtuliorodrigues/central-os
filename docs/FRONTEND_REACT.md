# Frontend React — Central OS local

O novo frontend fica em `apps/central-os/frontend` e consome apenas os endpoints já existentes do backend Central OS.

## Desenvolvimento

```powershell
cd apps\central-os
npm install
npm --prefix frontend install
npm run dev
```

O Vite abre em `http://127.0.0.1:5173` e encaminha `/api` para `http://127.0.0.1:8787` por padrão.

## Build integrado

```powershell
cd apps\central-os
npm run frontend:build
```

Depois do build, `src/server.js` detecta `frontend/dist` e passa a servir o React no mesmo endereço da Central OS. No fluxo integrado do projeto, `scripts/start.ps1` usa a porta 8788 por padrão.

## Rollback visual

Os arquivos HTML/CSS/JS legados foram preservados. Para forçar a interface antiga mesmo com `frontend/dist` presente:

```env
CENTRAL_OS_LEGACY_UI=true
```

Nenhum endpoint, motor, banco ou integração é alterado por essa opção.
