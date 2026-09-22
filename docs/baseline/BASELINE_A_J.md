# Baseline A–J — referência pré-integração

Data de captura: 2026-09-22

## Regra de validação
Este documento separa **evidência documental/código** de **teste funcional executado**.
Nenhum item que dependa do Windows operacional, Docker local, Evolution local ou WhatsApp é marcado como aprovado sem execução real nesse ambiente.

| Baseline | Referência esperada do sistema atual | Evidência disponível agora | Status |
|---|---|---|---|
| A — Infraestrutura | Docker ativo; `evolution_postgres`; Evolution :8080; `sgp-whatsapp` conectado | Inicializador atual contém healthchecks e validação da instância | DOCUMENTADO / execução local pendente |
| B — Listener | Uma única instância de `COMANDO_WHATSAPP_RELATORIO_USUARIOS.py` | Inicializador atual detecta duplicados; listener atual identificado | DOCUMENTADO / execução local pendente |
| C — Comando WhatsApp | Comando recebido e usuário autorizado | Listener atual implementa comandos `!relatorio*` e registro | DOCUMENTADO / envio real pendente |
| D — Motor | Listener chama `motor_relatorio_os.py` com origem/destino/saida/--executar | Chamada subprocess confirmada em código | DOCUMENTADO / resultado real pendente |
| E — Encaminhamento | Mensagem original localizada e encaminhada ao destino | Motor usa forward nativo do registro original | DOCUMENTADO / WhatsApp real pendente |
| F — Central OS | `node src/server.js`, HTTP local :8787, API e painel | Repositório atual confirma entrypoint e rotas | DOCUMENTADO / execução local pendente |
| G — Importação | XLSX/CSV importados e normalizados | `spreadsheet-import.js` confirmado | DOCUMENTADO / planilha real pendente |
| H — Análise | OS comparadas ao histórico e classificadas | `possibly-closed.js`/analisadores atuais preservados | DOCUMENTADO / dataset real pendente |
| I — Grupos | Grupos descobertos na tabela `Chat` da Evolution | `postgres-docker.js` confirmado | DOCUMENTADO / DB local pendente |
| J — Histórico | Histórico/cache da Central OS consultável | `server.js` e arquivos `data/` confirmados | DOCUMENTADO / conteúdo local pendente |

## Gabarito funcional a capturar no Windows antes da aceitação final
1. `docker info` e `docker compose ps`.
2. Estado real do container `evolution_postgres`.
3. Estado real de `sgp-whatsapp` em `/instance/connectionState/...`.
4. PID único do listener e linha de prontidão.
5. Comando WhatsApp real recebido por usuário registrado.
6. Resultado de uma planilha de referência: total, pós-filtros, encontradas, revisar, não encontradas.
7. Confirmação visual do encaminhamento de pelo menos uma OS no grupo destino.
8. `/api/resumo`, `/api/grupos`, importação e análise da Central OS atual.
9. Valores de resumo/classificação usados como gabarito.
10. Reinicialização completa do Windows e execução do inicializador atual, se desejado como referência operacional.
