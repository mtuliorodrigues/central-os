# Central OS — V1

A Central OS usa uma planilha exportada do SGP como referência principal das ordens de serviço que devem ser analisadas. Depois, procura cada OS no histórico do grupo piloto **TÉC.PLAY**, relaciona o contexto e mostra evidências de conclusão, pendência ou necessidade de revisão.

## Fluxo atual

1. **Importar Planilha** — o usuário seleciona um arquivo `.xlsx` ou `.csv` dentro da própria plataforma.
2. **Identificar a OS no grupo** — cada linha válida da planilha é procurada no histórico do TÉC.PLAY.
3. **Relacionar contexto** — respostas diretas e mensagens próximas são relacionadas à OS localizada.
4. **Classificar** — o motor procura indícios de conclusão, pendência ou conflito.
5. **Mostrar evidências** — as mensagens usadas na classificação ficam disponíveis para conferência humana.

A V1 **não fecha nenhuma OS automaticamente**.

## Importação da planilha

A página `/importar-planilha` aceita:

- XLSX;
- CSV;
- arquivos de até 15 MB.

O importador tenta reconhecer cabeçalhos como:

- Cliente;
- CPF/CNPJ;
- OS;
- ID / Contrato;
- Login;
- Serviço / Plano;
- Descrição;
- Data.

Linhas duplicadas são preservadas. A importação ativa fica armazenada localmente em `data/current-import.json`, arquivo ignorado pelo Git.

O CPF permanece integralmente apenas no processamento local. Nas respostas de pré-visualização da interface ele é mascarado.

## Páginas

- `/` — Dashboard
- `/importar-planilha` — Importação e pré-visualização da planilha
- `/relatorio` — Resumo da análise das OS da planilha
- `/possivelmente-fechadas` — OS da planilha com indícios de conclusão
- `/grupos` — Grupos da Central OS
- `/configuracoes` — Configuração visual do projeto

## Execução local

Requer Node.js 18+ e a Evolution/PostgreSQL local já funcionando.

```powershell
git pull
npm install
npm start
```

O painel local fica em:

```text
http://127.0.0.1:8787
```

`npm run web` é mantido como alias do mesmo servidor.

A análise antiga de histórico sem a planilha foi preservada em:

```powershell
npm run analyze:legacy
```

## Grupo piloto

Nesta etapa, somente o TÉC.PLAY está ativo:

```text
553497702861-1601827551@g.us
```

## Arquitetura

- Front-end estático publicado na Vercel;
- motor local Node.js no computador operacional;
- leitura do histórico diretamente no PostgreSQL da Evolution via Docker;
- planilha processada localmente;
- dados reais dos clientes não são embutidos no repositório nem na versão estática da Vercel.

Ao abrir a versão publicada no mesmo computador do motor local, o front-end tenta acessar `http://127.0.0.1:8787` para importar a planilha e executar as análises.

## Testes

```powershell
npm run check
npm test
```

O repositório também possui CI no GitHub Actions para validar sintaxe e os testes básicos do fluxo planilha → WhatsApp → classificação.
