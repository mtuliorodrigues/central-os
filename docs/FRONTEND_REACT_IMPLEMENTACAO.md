# Central OS — implementação do frontend React local

## Base analisada

O frontend legado é HTML/CSS/JavaScript vanilla servido por `apps/central-os/src/server.js`. Os arquivos principais analisados foram `index.html`, `styles.css`, `ui.js`, `dashboard.js`, `analysis-list.js`, `possivelmente-fechadas.js`, `historico.js`, `grupos.js`, `importar-planilha.js`, `local-api.js` e as páginas HTML associadas. O backend/API foi mantido com os endpoints existentes (`/api/resumo`, `/api/analise`, `/api/planilha/*`, `/api/historico`, `/api/grupos`, `/api/relatorio/*`, `/api/health`).

## Nova arquitetura

- React + TypeScript + Vite
- Tailwind CSS como base utilitária
- componentes próprios no padrão shadcn/ui, sem dependência redundante de outra biblioteca de componentes
- React Router para navegação SPA
- Motion para microinterações/transições
- Lucide Icons
- TanStack Query para leitura/cache/invalidação das APIs existentes
- camada `lib/api.ts` para centralizar comunicação com o backend

## Páginas migradas

- Início
- OS Analisadas
- Localizadas nos Grupos
- Não Localizadas
- Possivelmente Fechadas
- Pendentes / Em análise
- Histórico
- Grupos
- Configurações
- Status do Sistema em tela cheia

Aliases preservados: `/relatorio` e `/importar-planilha`.

## Preservação e rollback

O frontend legado não foi apagado. `src/server.js` serve `frontend/dist` quando o build existe. Se não existir build, continua servindo a interface legada. `CENTRAL_OS_LEGACY_UI=true` força explicitamente a interface antiga.

Nenhuma regra de análise, matching, Evolution, PostgreSQL, listener, Relatório OS ou endpoint foi alterada.

## Comandos

```powershell
cd apps\central-os
npm install
npm --prefix frontend install
npm run frontend:build
```

Depois, use o inicializador integrado já existente na raiz (`INICIAR_TUDO.bat`). No fluxo integrado, a porta padrão é 8788.

Para desenvolvimento isolado do frontend:

```powershell
cd apps\central-os
npm run dev
```

Vite: `http://127.0.0.1:5173`
Backend de desenvolvimento: `http://127.0.0.1:8787`

## Validações executadas nesta sessão

- `node --check src/server.js`: passou
- `node --check scripts/dev.mjs`: passou
- parse/transpilação sintática de todos os `.ts/.tsx` via TypeScript: passou
- validação de imports relativos: passou
- `node --test test/relatorio-bridge.test.js`: 6/6 passaram
- suíte completa `npm test`: 6 testes passaram; o teste de planilha não pôde iniciar porque `exceljs` não está instalado no ambiente desta sessão
- build React não pôde ser concluído neste ambiente porque as dependências npm do novo frontend ainda não estão instaladas e o ambiente não possui acesso ao registry npm. O build está configurado para rodar após `npm --prefix frontend install`.
