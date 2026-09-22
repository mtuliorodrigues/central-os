import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const integratedRoot = path.resolve(here, "../../..");

function parseEnv(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return false;
  const values = parseEnv(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
  return true;
}

process.env.CENTRAL_OS_ROOT ||= integratedRoot;
loadEnvFile(path.join(integratedRoot, "config", "app.env"));
loadEnvFile(path.join(integratedRoot, "apps", "relatorio-os", ".env"));

export { parseEnv, loadEnvFile };
