import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;

  let value = match[2].trim();
  const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  if (quoted) value = value.slice(1, -1);

  return [match[1], value];
}

async function loadEnvFile(filePath) {
  if (!filePath) return;

  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  const content = await readFile(resolvedPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) process.env[key] = value;
  }

  console.log(`[env] loaded ${resolvedPath}`);
}

await loadEnvFile(process.env.LIMOS_ENV_FILE);
await import("./check-environment.mjs");
await import("./write-config.mjs");
await import("../server/node-server.mjs");
