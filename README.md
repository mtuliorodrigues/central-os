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
