import test from "node:test";
import assert from "node:assert/strict";
import { parseSpreadsheetBuffer, publicImportSummary } from "../src/spreadsheet-import.js";
import { analyzeSpreadsheetReferences, findPossiblyClosed } from "../src/possibly-closed.js";

test("importa CSV separado por ponto e vírgula sem quebrar vírgula da descrição", async () => {
  const csv = [
    "Cliente;ID;Login;Serviço;Descrição;CPF",
    "Maria Teste;12345;maria;Internet 500M;Sem conexão, cliente sem sinal;12345678901"
  ].join("\n");

  const parsed = await parseSpreadsheetBuffer(Buffer.from(csv, "utf8"), "os.csv");

  assert.equal(parsed.references.length, 1);
  assert.equal(parsed.references[0].client, "Maria Teste");
  assert.equal(parsed.references[0].contractId, "12345");
  assert.equal(parsed.references[0].description, "Sem conexão, cliente sem sinal");
  assert.equal(parsed.references[0].cpf, "12345678901");

  const publicView = publicImportSummary(parsed);
  assert.equal(publicView.preview[0].cpf, "***.***.***-**");
});

test("usa a planilha como referência e encontra evidência de conclusão por resposta direta", async () => {
  const messages = [
    {
      key: { id: "os-1", remoteJid: "553497702861-1601827551@g.us" },
      pushName: "Tulio",
      messageTimestamp: 1000,
      message: {
        conversation: "*Cliente:* Maria Teste\n*ID:* 12345\n*Login:* maria\n*Serviço:* Internet 500M\n*Descrição:* Sem conexão, cliente sem sinal"
      }
    },
    {
      key: { id: "reply-1", remoteJid: "553497702861-1601827551@g.us" },
      pushName: "Wander",
      messageTimestamp: 1010,
      message: {
        extendedTextMessage: {
          text: "Bom dia, foi feita",
          contextInfo: {
            stanzaId: "os-1",
            quotedMessage: {
              conversation: "*Cliente:* Maria Teste\n*ID:* 12345\n*Login:* maria\n*Serviço:* Internet 500M\n*Descrição:* Sem conexão, cliente sem sinal"
            }
          }
        }
      }
    },
    {
      key: { id: "os-2", remoteJid: "553497702861-1601827551@g.us" },
      pushName: "Tulio",
      messageTimestamp: 1100,
      message: {
        conversation: "*Cliente:* Outro Cliente\n*ID:* 99999\n*Login:* outro\n*Serviço:* Internet\n*Descrição:* Lentidão"
      }
    }
  ];

  const references = [{
    rowNumber: 2,
    client: "Maria Teste",
    cpf: "12345678901",
    osNumber: "",
    contractId: "12345",
    login: "maria",
    service: "Internet 500M",
    description: "Sem conexão, cliente sem sinal",
    date: ""
  }];

  const analysis = analyzeSpreadsheetReferences(messages, references, { days: 30 });
  assert.equal(analysis.totalSpreadsheetOS, 1);
  assert.equal(analysis.totalMatched, 1);
  assert.equal(analysis.totalUnmatched, 0);
  assert.equal(analysis.items[0].classification, "possivelmente_realizada");
  assert.equal(analysis.items[0].evidence[0].relation, "resposta");

  const closed = findPossiblyClosed(messages, { days: 30, references });
  assert.equal(closed.totalPossiblyClosed, 1);
  assert.equal(closed.items[0].reference.client, "Maria Teste");
  assert.equal("cpf" in closed.items[0].reference, false);
});

test("OS da planilha sem correspondência fica como não localizada", () => {
  const references = [{
    rowNumber: 2,
    client: "Cliente Inexistente",
    cpf: "",
    osNumber: "",
    contractId: "77777",
    login: "naoexiste",
    service: "",
    description: "Descrição sem correspondência",
    date: ""
  }];

  const analysis = analyzeSpreadsheetReferences([], references, { days: 30 });
  assert.equal(analysis.totalMatched, 0);
  assert.equal(analysis.totalUnmatched, 1);
  assert.equal(analysis.items[0].classification, "nao_localizada");
});

test("mantém o grupo de origem e não mistura contexto entre grupos", () => {
  const groupA = "111111111111@g.us";
  const groupB = "222222222222@g.us";
  const rootText = "*Cliente:* Cliente Grupo A\n*ID:* 45678\n*Login:* grupoa\n*Serviço:* Internet\n*Descrição:* Sem conexão";

  const messages = [
    {
      __groupName: "TÉC.PLAY",
      __groupJid: groupA,
      key: { id: "root-a", remoteJid: groupA },
      messageTimestamp: 2000,
      message: { conversation: rootText }
    },
    {
      __groupName: "Rede Play",
      __groupJid: groupB,
      key: { id: "other-b", remoteJid: groupB },
      messageTimestamp: 2001,
      message: { conversation: "foi feito" }
    },
    {
      __groupName: "TÉC.PLAY",
      __groupJid: groupA,
      key: { id: "reply-a", remoteJid: groupA },
      messageTimestamp: 2002,
      message: {
        extendedTextMessage: {
          text: "cliente ok",
          contextInfo: { stanzaId: "root-a", quotedMessage: { conversation: rootText } }
        }
      }
    }
  ];

  const references = [{
    rowNumber: 2,
    client: "Cliente Grupo A",
    cpf: "",
    osNumber: "",
    contractId: "45678",
    login: "grupoa",
    service: "Internet",
    description: "Sem conexão",
    date: ""
  }];

  const analysis = analyzeSpreadsheetReferences(messages, references, { days: 30 });
  assert.equal(analysis.items[0].groupName, "TÉC.PLAY");
  assert.equal(analysis.items[0].classification, "possivelmente_realizada");
  assert.equal(analysis.items[0].evidence.length, 1);
  assert.equal(analysis.items[0].evidence[0].groupName, "TÉC.PLAY");
});

