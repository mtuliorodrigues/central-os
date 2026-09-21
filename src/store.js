import { mkdir, writeFile } from "node:fs/promises";
export async function saveRun(result) {
  await mkdir("data", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `data/analise-${stamp}.json`;
  await writeFile(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}
