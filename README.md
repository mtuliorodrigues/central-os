# Central OS — V1

Projeto separado para auditar o histórico de um grupo de WhatsApp e localizar indícios de OS que podem ter sido realizadas, mas continuam abertas no sistema.

## O que a V1 faz

- lê o histórico de um grupo pela Evolution API;
- identifica mensagens que parecem representar uma OS;
- reconhece metadados de resposta, encaminhamento e marcação/menção;
- analisa mensagens próximas e respostas ligadas à OS;
- procura indícios textuais de realização ou pendência;
- classifica como `possivelmente_realizada`, `possivelmente_pendente`, `revisao_manual` ou `sem_evidencia`;
- registra a evidência usada: ID da mensagem, horário, remetente, tipo de vínculo, texto e motivo;
- grava cada execução em JSON dentro de `data/`.

A V1 é deliberadamente conservadora: ela **não fecha OS** e não transforma indício em fato. O resultado serve para conferência humana.

## Instalação

Requer Node.js 18+ e uma instância já conectada da Evolution API.

1. `npm install`
2. copie `.env.example` para `.env`
3. informe URL, API key, instância e JID do grupo
4. execute `npm start`

## Configuração

`EVOLUTION_BASE_URL` — URL da Evolution API  
`EVOLUTION_API_KEY` — API key  
`EVOLUTION_INSTANCE` — nome da instância  
`SOURCE_GROUP_JID` — JID do grupo analisado  
`HISTORY_LIMIT` — quantidade máxima de mensagens  
`CONTEXT_BEFORE` / `CONTEXT_AFTER` — janela de contexto

## Próxima etapa

Validar a estrutura real retornada pela versão da Evolution API instalada e calibrar as expressões com mensagens reais do grupo. Depois disso podemos adicionar correlação com a planilha de OS abertas sem misturar essa função com os outros projetos.

## Possivelmente Fechadas

A página `/possivelmente-fechadas` é separada do relatório normal e foi criada para conferência de OS com indícios de conclusão.

Ela permite analisar os últimos **20 ou 30 dias** e mostra, por OS:

- cliente e identificação disponível;
- data;
- login e serviço quando presentes;
- descrição completa;
- mensagem original;
- evidências relacionadas, remetente, horário e motivo da classificação.

Para preservar os dados dos clientes, o histórico real **não é publicado no repositório nem embutido na Vercel**. O motor roda localmente no computador que possui a Evolution/PostgreSQL:

```powershell
git pull
npm install
npm run web
```

Depois, acesse localmente:

```text
http://127.0.0.1:8787/possivelmente-fechadas
```

A V1 usa apenas o grupo piloto TÉC.PLAY. A classificação desta página é mais conservadora que a análise geral: mensagens que também parecem outra OS não são usadas como evidência de uma OS vizinha, e respostas diretamente vinculadas recebem prioridade.
