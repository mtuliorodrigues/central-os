# Produção Vercel

## Projeto existente

- equipe: `tulio-s-org`;
- projeto: `central-os`;
- repositório: `mtuliorodrigues/central-os`;
- branch de produção: `main`;
- domínio: `https://central-os-lake.vercel.app`;
- diretório raiz: raiz do repositório;
- framework: Vite, definido em `vercel.json`;
- saída: `apps/central-os/frontend/dist`.

O deploy é disparado pela integração Git depois do push em `main`. Não crie outro projeto Vercel.

## Configuração pública

O build usa somente variáveis públicas, versionadas em `apps/central-os/frontend/.env.production`:

- `VITE_APP_MODE`;
- `VITE_API_URL`.

Nenhuma API key, token, grupo, sessão ou credencial deve usar prefixo `VITE_`. O projeto Vercel não precisa de segredos para o frontend estático atual.

## Build local equivalente

```powershell
cd C:\Central OS\apps\central-os\frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

## Publicação

```powershell
cd C:\Central OS
git push origin main
```

O `vercel.json` define o install, build, output e fallback SPA. Após o deploy, valide `/`, `/os-analisadas`, `/historico`, `/grupos`, `/configuracoes` e `/status`, incluindo refresh direto.

## Operação integrada

Na primeira abertura, o Chrome pode solicitar permissão para a página acessar a rede local. Essa permissão é necessária porque o frontend HTTPS consulta o runtime em `http://127.0.0.1:8788`. Depois de iniciar a Central OS Local, permita o acesso para que os dados e os healthchecks apareçam no painel.

1. Execute `C:\Central OS\INICIAR_TUDO.bat`.
2. Confirme `Central OS Local pronta para uso: SIM`.
3. Abra `https://central-os-lake.vercel.app` no mesmo computador.
4. O navegador consulta `http://127.0.0.1:8788`; a API habilita CORS e Private Network Access para esse fluxo.

Se o runtime estiver indisponível, o frontend mostra um aviso e permite nova tentativa. Não publique a porta 8788 na internet.

## Rollback

- frontend: na Vercel, restaure/promova o deployment Production anterior;
- código: reverta o commit em `main` e faça push;
- Evolution: selecione novamente uma imagem previamente validada no compose local e execute o healthcheck;
- UI local: `CENTRAL_OS_LEGACY_UI=true` força temporariamente a interface legada servida pelo Node.

## Diagnóstico essencial

- `scripts/healthcheck.ps1 -Json`: estado de todos os componentes locais;
- `logs/inicializador/`: inicialização;
- `logs/central-os/`: backend Node;
- `logs/relatorio-os/listener/`: listener;
- painel Vercel: build, deployment e domínio;
- DevTools do navegador: falhas de acesso a `127.0.0.1:8788`.
