import {
  createPayloadEtag,
  getDefaultPayload,
  stripPayloadAvatars,
  upsertPayloadWeightEntry,
} from "./payload-utils.js";
import { readRequestBody } from "./request-utils.js";
import {
  fetchState,
  getEnvConfig,
  hasSupabaseConfig,
  writeWeightEntryRow,
  writeState,
} from "./supabase-store.js";
import { sendJson, sendMethodNotAllowed } from "./http-utils.js";

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
    sendJson(response, 500, { error: "missing_supabase_config" });
    return;
  }

  if (request.method !== "POST") {
    sendMethodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const body = await readRequestBody(request);
    const { participantId, entry } = normalizeEntry(body);
    if (!participantId || !isValidDate(entry.date) || !isValidWeight(entry.weight)) {
      sendJson(response, 400, { error: "invalid_weight_entry" });
      return;
    }

    const payload = structuredClone(await fetchState(config, { forceFresh: true }) || getDefaultPayload());
    const updated = upsertPayloadWeightEntry(payload, participantId, entry);
    if (!updated) {
      sendJson(response, 404, { error: "participant_not_found" });
      return;
    }

    const wroteEntryRow = await writeWeightEntryRow(config, participantId, entry);
    if (wroteEntryRow) {
      sendJson(response, 200, { ok: true, mode: "entry" });
      return;
    }

    await writeState(config, payload);
    sendJson(response, 200, { ok: true }, {
      ETag: createPayloadEtag(stripPayloadAvatars(payload)),
    });
  } catch (error) {
    console.error(error);
    sendJson(response, 502, { error: "weight_entry_sync_failed" });
  }
}
