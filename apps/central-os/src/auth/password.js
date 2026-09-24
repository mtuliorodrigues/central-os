import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const scrypt = promisify(scryptCallback);
const VERSION = "1";
const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(password) {
  const value = String(password ?? "");
  if (!value) throw new Error("Senha não pode ser vazia.");
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(value, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 32 * 1024 * 1024 });
  return `scrypt$${VERSION}$N=${N},r=${R},p=${P}$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [algorithm, version, parameters, saltText, hashText] = String(encoded || "").split("$");
    if (algorithm !== "scrypt" || version !== VERSION || !parameters || !saltText || !hashText) return false;
    const values = Object.fromEntries(parameters.split(",").map(part => part.split("=")));
    const n = Number(values.N);
    const r = Number(values.r);
    const p = Number(values.p);
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || !salt.length || !expected.length) return false;
    const actual = Buffer.from(await scrypt(String(password ?? ""), salt, expected.length, { N: n, r, p, maxmem: 32 * 1024 * 1024 }));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
