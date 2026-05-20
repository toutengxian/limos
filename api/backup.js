import {
  fetchState,
  fetchWeightEntryRows,
  getDefaultPayload,
  getEnvConfig,
  hasSupabaseConfig,
  mergeWeightEntriesIntoPayload,
  writeBackupSnapshot,
} from "./state-store.js";

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    json(response, 405, { error: "method_not_allowed" });
    return;
  }

  const config = getEnvConfig();
  if (!hasSupabaseConfig(config)) {
    json(response, 500, { error: "missing_supabase_config" });
    return;
  }

  const expectedToken = process.env.LIMOS_BACKUP_TOKEN || "";
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const token = request.headers["x-limos-backup-token"] || requestUrl.searchParams.get("token") || "";
  if (expectedToken && token !== expectedToken) {
    json(response, 401, { error: "invalid_backup_token" });
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
    json(response, 200, {
      ok: true,
      stateId: config.stateId,
      participantCount: Array.isArray(mergedPayload.participants) ? mergedPayload.participants.length : 0,
      weightEntryCount: weightEntries.length,
      backedUpAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    json(response, 502, { error: "backup_failed" });
  }
}
