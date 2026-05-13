const env = process.env;

const supabaseUrl = env.LIMOS_SUPABASE_URL || "";
const supabaseKey = env.LIMOS_SUPABASE_SERVICE_ROLE_KEY || env.LIMOS_SUPABASE_ANON_KEY || "";
const storageMode = env.LIMOS_STORAGE_MODE || (supabaseUrl && supabaseKey ? "api" : "local");
const stateId = env.LIMOS_STATE_ID || (storageMode === "api" ? "limos-2026" : "limos-local");
const adminCodeHash = env.LIMOS_ADMIN_CODE_HASH || "";
const vercelEnv = env.VERCEL_ENV || "";
const limosEnv = env.LIMOS_ENV || (vercelEnv === "production" ? "production" : vercelEnv ? "development" : "local");

const errors = [];
const warnings = [];

function isPlaceholder(value) {
  return !value || /YOUR_|SHA256_OF_|example|placeholder/i.test(value);
}

if (storageMode !== "local" && storageMode !== "api") {
  errors.push(`LIMOS_STORAGE_MODE must be "local" or "api", got "${storageMode}".`);
}

if (storageMode === "api") {
  if (isPlaceholder(supabaseUrl)) errors.push("LIMOS_SUPABASE_URL is required for api storage.");
  if (isPlaceholder(supabaseKey)) errors.push("LIMOS_SUPABASE_ANON_KEY or LIMOS_SUPABASE_SERVICE_ROLE_KEY is required for api storage.");
  if (isPlaceholder(adminCodeHash)) errors.push("LIMOS_ADMIN_CODE_HASH is required for api storage.");
  if (!stateId) errors.push("LIMOS_STATE_ID is required for api storage.");
}

if (vercelEnv && storageMode !== "api") {
  errors.push("Vercel deployments must use LIMOS_STORAGE_MODE=api.");
}

if (limosEnv === "production" && /dev|preview|test/i.test(stateId)) {
  errors.push(`Production must not use development-looking LIMOS_STATE_ID "${stateId}".`);
}

if (limosEnv !== "production" && storageMode === "api" && stateId === "limos-2026") {
  errors.push("Non-production api environments must not use the production LIMOS_STATE_ID=limos-2026.");
}

if (limosEnv !== "production" && storageMode === "api" && !/dev|preview|test/i.test(stateId)) {
  warnings.push(`Non-production LIMOS_STATE_ID "${stateId}" should include "dev", "preview", or "test" for clarity.`);
}

if (storageMode === "local") {
  warnings.push("Using local storage mode. This is fine for single-device preview only.");
}

warnings.forEach((warning) => console.warn(`[env] ${warning}`));

if (errors.length) {
  errors.forEach((error) => console.error(`[env] ${error}`));
  process.exit(1);
}

console.log(`[env] ok: LIMOS_ENV=${limosEnv}, storageMode=${storageMode}, stateId=${stateId}`);
