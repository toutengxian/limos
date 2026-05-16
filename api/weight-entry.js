import {
  createPayloadEtag,
  fetchState,
  getDefaultPayload,
  getEnvConfig,
  hasSupabaseConfig,
  readRequestBody,
  stripPayloadAvatars,
  upsertPayloadWeightEntry,
  writeWeightEntryRow,
  writeState,
} from "./state-store.js";

function json(response, statusCode, body, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", headers["Cache-Control"] || "no-store");
  Object.entries(headers).forEach(([key, value]) => {
    if (key !== "Cache-Control") response.setHeader(key, value);
  });
  response.end(JSON.stringify(body));
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function isValidWeight(value) {
  return Number.isFinite(value) && value >= 30 && value <= 250;
}

function normalizeEntry(body) {
  const weight = Number(body?.weight);
  return {
    participantId: String(body?.participantId || ""),
    entry: {
      date: String(body?.date || ""),
      weight: Math.round(weight * 10) / 10,
      createdAt: body?.createdAt || new Date().toISOString(),
      updatedAt: body?.updatedAt || new Date().toISOString(),
      mutationId: body?.mutationId || "",
    },
  };
}

export default async function handler(request, response) {
  const config = getEnvConfig();

  if (!hasSupabaseConfig(config)) {
    json(response, 500, { error: "missing_supabase_config" });
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    json(response, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const { participantId, entry } = normalizeEntry(body);
    if (!participantId || !isValidDate(entry.date) || !isValidWeight(entry.weight)) {
      json(response, 400, { error: "invalid_weight_entry" });
      return;
    }

    const wroteEntryRow = await writeWeightEntryRow(config, participantId, entry);
    if (wroteEntryRow) {
      json(response, 200, { ok: true, mode: "entry" });
      return;
    }

    const payload = await fetchState(config, { forceFresh: true }) || getDefaultPayload();
    const updated = upsertPayloadWeightEntry(payload, participantId, entry);
    if (!updated) {
      json(response, 404, { error: "participant_not_found" });
      return;
    }

    await writeState(config, payload);
    json(response, 200, { ok: true }, {
      ETag: createPayloadEtag(stripPayloadAvatars(payload)),
    });
  } catch (error) {
    console.error(error);
    json(response, 502, { error: "weight_entry_sync_failed" });
  }
}
