import { spawn } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const backend = spawn(process.execPath, ["src/server.js"], { stdio: "inherit", env: process.env });
const frontend = spawn(npmCommand, ["--prefix", "frontend", "run", "dev"], { stdio: "inherit", env: process.env });

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  backend.kill("SIGTERM");
  frontend.kill("SIGTERM");
  setTimeout(() => process.exit(code), 200);
}

backend.on("exit", (code) => { if (!stopping) stop(code ?? 1); });
frontend.on("exit", (code) => { if (!stopping) stop(code ?? 1); });
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
