import "../integrated-env.js";
import readline from "node:readline";
import { bootstrapMasterAdmin } from "./service.js";

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

function askSecret(question) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error("O bootstrap de senha exige um terminal interativo.");
  return new Promise(resolve => {
    process.stdout.write(question);
    let value = "";
    const onData = chunk => {
      for (const char of String(chunk)) {
        if (char === "\u0003") process.exit(130);
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(value);
        } else if (char === "\u007f") {
          value = value.slice(0, -1);
        } else if (char >= " ") value += char;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

const name = await ask("Nome: ");
const username = await ask("Username: ");
const password = await askSecret("Senha: ");
const confirmation = await askSecret("Confirme a senha: ");
if (!password || password !== confirmation) throw new Error("A senha não pode ser vazia e as confirmações devem coincidir.");
const user = await bootstrapMasterAdmin({ name, username, password });
console.log(JSON.stringify({ ok: true, user }));
