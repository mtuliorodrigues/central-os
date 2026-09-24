# Correção Evolution `phase2-fix1`

Base oficial: tag `2.3.7`, commit `cd800f2976e1e5b682fbf86a01ee4d85ae61f370`.

O patch versionado em `infra/evolution/patches/evolution-api-2.3.7-phase2-fix1.patch` adiciona:

- rota e controller `forwardMessage`;
- encaminhamento pelo `sendMessageWithTyping`, preservando persistência, logs e eventos;
- suporte direto ao conteúdo `forward` na preparação Baileys;
- rota e implementação `syncHistory` sob demanda;
- correlação da sincronização por request e grupo quando o protocolo fornece o identificador.

Imagem: `evolution-api-forward-sync-direct:2.3.7-phase2-fix1`.

O fonte operacional externo continua em `C:\EvolutionSGP\evolution-forward-src`. O patch e o script de build na Central OS permitem reconstruir a imagem sem versionar sessão, `.env`, banco ou credenciais.
