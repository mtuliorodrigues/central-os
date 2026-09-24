# Inventário de evidências

As evidências brutas ficam em `data/relatorio-os/saida/`, que é ignorado pelo Git. Este inventário registra apenas localização, finalidade e hash.

| Artefato local | Finalidade | SHA-256 |
|---|---|---|
| `fase2-etapa-a-20260922-212813/summary.json` | resumo da prévia | `788485EA29EA255C63A3AB33FB004779BA4961BBD8ED62A3DD25F47033992745` |
| `fase2-etapa-a-20260922-212813/matching_audit.json` | auditoria dos sinais de matching | `8414E45D0FCE7CC3A3080F2CDE78BB8F5A55CBC9C6363BD60C71D3F6E46DAB1F` |
| `fase2-etapa-a-20260922-212813/tie_audit.json` | caso ambíguo separado para revisão | `11BC9341847E42CE5BD979C0D38264382E9345DD7D4223D5EBC1815FD876A35E` |
| `fase2-etapa-a-20260922-212813/third-controlled-python-send.json` | teste real do pipeline Python | `EEA33395F8B28484D1B72D6E565A5C8D5BBA11A039C1379BD52C87DFA9023AB9` |
| `fase2-lote-bypass-preexistentes-20260923-100536/batch-report.json` | diagnóstico de preexistências | `5991AB7A185F3AE9E795FE5AFE93518312552365829613F140A6E799825011F0` |
| `fase2-lote-continuacao-reconciliada-20260923-103655/batch-report.json` | reconciliação final dos sete itens | `26725C61767DF46AA9788961696A1D0166EBE3FCF7F4F8E0124419BD0B9B9FA2` |

Outros CSVs, logs e JSONs do mesmo diretório são auxiliares e permanecem preservados localmente. Não copie esses arquivos para documentação versionada.
