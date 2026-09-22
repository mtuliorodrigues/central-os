# Portabilidade

A integração não depende de `C:\RelatoriosSGP` no código. O listener usa, por padrão, `data/planilhas` relativo à raiz do projeto.

A única referência legada intencional é `EVOLUTION_EXISTING_DIR`, configurável em `config/app.env`, porque a fase 1 deve reutilizar a infraestrutura Evolution/PostgreSQL já existente sem mover volumes.

Os arquivos reais `config/app.env`, `apps/relatorio-os/.env`, `grupos_relatorio_os.json` e `usuarios_relatorio.json` ficam fora do Git.
