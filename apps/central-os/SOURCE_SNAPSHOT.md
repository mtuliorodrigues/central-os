# Origem do snapshot Central OS

- Repositório de referência: `mtuliorodrigues/central-os`
- Branch: `main`
- Árvore/commit observado na inspeção: `9ca20c9ee5f3e43119779ded8d58e32a48752143`
- Data da captura: 2026-09-22

## Escopo importado nesta cópia

O núcleo de execução e regras foi copiado a partir do repositório de referência:

- `src/server.js`
- `src/analyzer.js`
- `src/possibly-closed.js`
- `src/spreadsheet-import.js`
- `src/postgres-docker.js`
- `src/evolution.js`
- `src/index.js`
- `src/store.js`
- `test/spreadsheet-flow.test.js`
- `package.json`
- `.env.example`

A interface da versão integrada é desenvolvida sobre uma cópia funcional do dashboard, sem alterar o repositório original. A limitação do ambiente de execução impediu um `git clone`/download de arquivo ZIP; por isso este manifesto registra explicitamente a origem em vez de afirmar uma clonagem completa.

As regras de análise dos módulos `analyzer.js` e `possibly-closed.js` não devem ser alteradas pela integração.
