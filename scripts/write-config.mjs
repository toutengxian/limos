import { writeFile } from "node:fs/promises";

const supabaseUrl = process.env.LIMOS_SUPABASE_URL || "";
const supabaseAnonKey = process.env.LIMOS_SUPABASE_ANON_KEY || "";
const storageMode = process.env.LIMOS_STORAGE_MODE || (supabaseUrl && supabaseAnonKey ? "supabase" : "local");
const stateId = process.env.LIMOS_STATE_ID || "limos-2026";
const adminCodeHash = process.env.LIMOS_ADMIN_CODE_HASH || "";

const config = {
  storageMode,
  stateId,
  supabaseUrl,
  supabaseAnonKey,
  adminCodeHash,
};

const source = `window.LIMOS_CONFIG = ${JSON.stringify(config, null, 2)};\n`;

await writeFile(new URL("../config.js", import.meta.url), source);
console.log(`Wrote config.js with storageMode=${storageMode}`);
