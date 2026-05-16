import { writeFile } from "node:fs/promises";

const supabaseUrl = process.env.LIMOS_SUPABASE_URL || "";
const supabaseAnonKey = process.env.LIMOS_SUPABASE_ANON_KEY || "";
const storageMode = process.env.LIMOS_STORAGE_MODE || (supabaseUrl && supabaseAnonKey ? "api" : "local");
const stateId = process.env.LIMOS_STATE_ID || (storageMode === "api" ? "limos-2026" : "limos-local");
const adminCodeHash = process.env.LIMOS_ADMIN_CODE_HASH || "";
const apiEndpoint = process.env.LIMOS_API_ENDPOINT || "/api/state";
const weightEntryEndpoint = process.env.LIMOS_WEIGHT_ENTRY_ENDPOINT || "/api/weight-entry";
const environment = process.env.LIMOS_ENV || process.env.VERCEL_ENV || "local";

const config = {
  environment,
  storageMode,
  stateId,
  apiEndpoint,
  weightEntryEndpoint,
  adminCodeHash,
};

const source = `window.LIMOS_CONFIG = ${JSON.stringify(config, null, 2)};\n`;

await writeFile(new URL("../config.js", import.meta.url), source);
console.log(`Wrote config.js with storageMode=${storageMode}`);
