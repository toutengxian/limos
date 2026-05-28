import {
  getDefaultPayload,
  mergeWeightEntriesIntoPayload,
} from "./payload-utils.js";
import {
  fetchState,
  fetchWeightEntryRows,
  getEnvConfig,
  hasSupabaseConfig,
  writeBackupSnapshot,
} from "./supabase-store.js";
import { sendJson, sendMethodNotAllowed } from "./http-utils.js";

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    sendMethodNotAllowed(response, ["GET", "POST"]);
    return;
  }

  const config = getEnvConfig();
  if (!hasSupabaseConfig(config)) {
    sendJson(response, 500, { error: "missing_supabase_config" });
    return;
  }

  const expectedToken = process.env.LIMOS_BACKUP_TOKEN || "";
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const token = request.headers["x-limos-backup-token"] || requestUrl.searchParams.get("token") || "";
  if (expectedToken && token !== expectedToken) {
    sendJson(response, 401, { error: "invalid_backup_token" });
    return;
  }

  try {
    const payload = await fetchState(config, { forceFresh: true }) || getDefaultPayload();
    const weightEntries = await fetchWeightEntryRows(config, { strict: true });
    const mergedPayload = mergeWeightEntriesIntoPayload(structuredClone(payload), weightEntries);
    await writeBackupSnapshot(config, {
      source: request.method === "GET" ? "scheduled" : "manual",
      payload: mergedPayload,
      weightEntries,
    });
    sendJson(response, 200, {
      ok: true,
      stateId: config.stateId,
      participantCount: Array.isArray(mergedPayload.participants) ? mergedPayload.participants.length : 0,
      weightEntryCount: weightEntries.length,
      backedUpAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 502, { error: "backup_failed" });
  }
}
