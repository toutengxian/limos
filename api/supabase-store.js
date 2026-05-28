import { createPayloadEtag } from "./payload-utils.js";

export const TABLE_NAME = "fat_battle_state";
export const WEIGHT_ENTRIES_TABLE_NAME = "limos_weight_entries";
export const BACKUPS_TABLE_NAME = "limos_state_backups";

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

export function updateStateCache(config, payload) {
  stateCache = {
    cacheKey: getCacheKey(config),
    etag: createPayloadEtag(payload),
    fetchedAt: Date.now(),
    payload,
  };
}

export async function fetchState(config, options = {}) {
  const record = await fetchStateRecord(config, options);
  return record?.payload || null;
}

export async function fetchStateRecord(config, options = {}) {
  const cacheKey = getCacheKey(config);
  const cacheAge = Date.now() - stateCache.fetchedAt;
  if (!options.forceFresh && stateCache.cacheKey === cacheKey && stateCache.payload && cacheAge < STATE_CACHE_TTL_MS) {
    return { payload: stateCache.payload, updatedAt: "" };
  }

  const query = `?id=eq.${encodeURIComponent(config.stateId)}&select=payload,updated_at`;
  const response = await fetch(createTableUrl(config, query), {
    headers: createSupabaseHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${response.status}`);
  }

  const rows = await response.json();
  const payload = rows[0]?.payload || null;
  if (payload) updateStateCache(config, payload);
  return payload ? { payload, updatedAt: rows[0]?.updated_at || "" } : null;
}

export async function writeState(config, payload, options = {}) {
  if (options.expectedUpdatedAt) {
    const updatedAt = new Date().toISOString();
    const query = [
      `?id=eq.${encodeURIComponent(config.stateId)}`,
      `updated_at=eq.${encodeURIComponent(options.expectedUpdatedAt)}`,
      "select=id",
    ].join("&");
    const response = await fetch(createTableUrl(config, query), {
      method: "PATCH",
      headers: {
        ...createSupabaseHeaders(config),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        payload,
        updated_at: updatedAt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Supabase conditional write failed: ${response.status}`);
    }

    const rows = await response.json();
    if (!rows.length) {
      const conflictError = new Error("Supabase conditional write conflict");
      conflictError.code = "state_write_conflict";
      throw conflictError;
    }

    updateStateCache(config, payload);
    return;
  }

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

export async function fetchWeightEntryRows(config, options = {}) {
  const query = [
    `state_id=eq.${encodeURIComponent(config.stateId)}`,
    "select=participant_id,entry_date,weight,created_at,updated_at,mutation_id",
  ].join("&");
  const response = await fetch(createRestUrl(config, WEIGHT_ENTRIES_TABLE_NAME, `?${query}`), {
    headers: createSupabaseHeaders(config),
  });

  if (!response.ok) {
    if (options.strict) {
      throw new Error(`Supabase weight entries read failed: ${response.status}`);
    }
    return [];
  }
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

export async function writeBackupSnapshot(config, snapshot) {
  const response = await fetch(createRestUrl(config, BACKUPS_TABLE_NAME), {
    method: "POST",
    headers: {
      ...createSupabaseHeaders(config),
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      state_id: config.stateId,
      source: snapshot.source || "manual",
      payload: snapshot.payload,
      weight_entries: snapshot.weightEntries || [],
      created_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase backup write failed: ${response.status}`);
  }
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
