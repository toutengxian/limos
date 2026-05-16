import { createHash } from "node:crypto";

export const TABLE_NAME = "fat_battle_state";
export const WEIGHT_ENTRIES_TABLE_NAME = "limos_weight_entries";
const STATE_CACHE_TTL_MS = Number.parseInt(process.env.LIMOS_STATE_CACHE_TTL_MS || "5000", 10);

let stateCache = {
  cacheKey: "",
  etag: "",
  fetchedAt: 0,
  payload: null,
};

export function getEnvConfig() {
  return {
    supabaseUrl: process.env.LIMOS_SUPABASE_URL || "",
    supabaseKey: process.env.LIMOS_SUPABASE_SERVICE_ROLE_KEY || process.env.LIMOS_SUPABASE_ANON_KEY || "",
    stateId: process.env.LIMOS_STATE_ID || "limos-2026",
  };
}

export function hasSupabaseConfig(config) {
  return Boolean(config.supabaseUrl && config.supabaseKey);
}

export function getDefaultPayload() {
  return {
    competition: {
      status: "waiting",
      startedAt: "",
      maxParticipants: 5,
    },
    participants: [],
  };
}

export async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createPayloadEtag(payload) {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("base64url");
  return `"${hash.slice(0, 32)}"`;
}

export function stripPayloadAvatars(payload) {
  return {
    ...payload,
    participants: Array.isArray(payload?.participants)
      ? payload.participants.map(({ avatar, ...participant }) => participant)
      : [],
  };
}

export function findParticipantAvatar(payload, participantId) {
  const participant = Array.isArray(payload?.participants)
    ? payload.participants.find((item) => item.id === participantId)
    : null;
  return participant?.avatar || "";
}

export function mergePayloadForWrite(existingPayload, incomingPayload) {
  const existingById = new Map(
    (existingPayload?.participants || []).map((participant) => [participant.id, participant]),
  );

  return {
    ...incomingPayload,
    participants: Array.isArray(incomingPayload?.participants)
      ? incomingPayload.participants.map((participant) => {
        const existing = existingById.get(participant.id);
        if (!participant.avatar && existing?.avatar) {
          return { ...participant, avatar: existing.avatar };
        }
        return participant;
      })
      : [],
  };
}

export function upsertPayloadWeightEntry(payload, participantId, entry) {
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  const participant = participants.find((item) => item.id === participantId);
  if (!participant) return false;

  const entries = Array.isArray(participant.entries) ? participant.entries : [];
  const existing = entries.find((item) => item.date === entry.date);
  if (existing) {
    existing.weight = entry.weight;
    existing.updatedAt = entry.updatedAt || new Date().toISOString();
    if (entry.mutationId) existing.mutationId = entry.mutationId;
  } else {
    entries.push({
      date: entry.date,
      weight: entry.weight,
      createdAt: entry.createdAt || new Date().toISOString(),
      ...(entry.mutationId ? { mutationId: entry.mutationId } : {}),
    });
  }
  participant.entries = entries;
  return true;
}

export function mergeWeightEntriesIntoPayload(payload, rows) {
  if (!Array.isArray(rows) || !rows.length) return payload;

  rows.forEach((row) => {
    upsertPayloadWeightEntry(payload, row.participant_id, {
      date: row.entry_date,
      weight: Number(row.weight),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mutationId: row.mutation_id,
    });
  });
  return payload;
}

export function updateStateCache(config, payload) {
  stateCache = {
    cacheKey: getCacheKey(config),
    etag: createPayloadEtag(payload),
    fetchedAt: Date.now(),
    payload,
  };
}

export async function fetchState(config, options = {}) {
  const cacheKey = getCacheKey(config);
  const cacheAge = Date.now() - stateCache.fetchedAt;
  if (!options.forceFresh && stateCache.cacheKey === cacheKey && stateCache.payload && cacheAge < STATE_CACHE_TTL_MS) {
    return stateCache.payload;
  }

  const query = `?id=eq.${encodeURIComponent(config.stateId)}&select=payload`;
  const response = await fetch(createTableUrl(config, query), {
    headers: createSupabaseHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${response.status}`);
  }

  const rows = await response.json();
  const payload = rows[0]?.payload || null;
  if (payload) updateStateCache(config, payload);
  return payload;
}

export async function writeState(config, payload) {
  const response = await fetch(createTableUrl(config), {
    method: "POST",
    headers: {
      ...createSupabaseHeaders(config),
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: config.stateId,
      payload,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase write failed: ${response.status}`);
  }

  updateStateCache(config, payload);
}

export async function fetchWeightEntryRows(config) {
  const query = [
    `state_id=eq.${encodeURIComponent(config.stateId)}`,
    "select=participant_id,entry_date,weight,created_at,updated_at,mutation_id",
  ].join("&");
  const response = await fetch(createRestUrl(config, WEIGHT_ENTRIES_TABLE_NAME, `?${query}`), {
    headers: createSupabaseHeaders(config),
  });

  if (!response.ok) return [];
  return response.json();
}

export async function writeWeightEntryRow(config, participantId, entry) {
  const response = await fetch(createRestUrl(config, WEIGHT_ENTRIES_TABLE_NAME), {
    method: "POST",
    headers: {
      ...createSupabaseHeaders(config),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      state_id: config.stateId,
      participant_id: participantId,
      entry_date: entry.date,
      weight: entry.weight,
      mutation_id: entry.mutationId || null,
      created_at: entry.createdAt || new Date().toISOString(),
      updated_at: entry.updatedAt || new Date().toISOString(),
    }),
  });

  return response.ok;
}

function createSupabaseHeaders(config) {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    "Content-Type": "application/json",
  };
}

function createTableUrl(config, query = "") {
  return createRestUrl(config, TABLE_NAME, query);
}

function createRestUrl(config, tableName, query = "") {
  const baseUrl = config.supabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rest/v1/${tableName}${query}`;
}

function getCacheKey(config) {
  return `${config.supabaseUrl}|${config.stateId}`;
}
