import { createHash } from "node:crypto";

const TABLE_NAME = "fat_battle_state";
const STATE_CACHE_TTL_MS = Number.parseInt(process.env.LIMOS_STATE_CACHE_TTL_MS || "5000", 10);
let stateCache = {
  cacheKey: "",
  etag: "",
  fetchedAt: 0,
  payload: null,
};

function getEnvConfig() {
  return {
    supabaseUrl: process.env.LIMOS_SUPABASE_URL || "",
    supabaseKey: process.env.LIMOS_SUPABASE_SERVICE_ROLE_KEY || process.env.LIMOS_SUPABASE_ANON_KEY || "",
    stateId: process.env.LIMOS_STATE_ID || "limos-2026",
  };
}

function json(response, statusCode, body, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", headers["Cache-Control"] || "no-store");
  Object.entries(headers).forEach(([key, value]) => {
    if (key !== "Cache-Control") response.setHeader(key, value);
  });
  response.end(JSON.stringify(body));
}

function notModified(response, etag) {
  response.statusCode = 304;
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("ETag", etag);
  response.end();
}

function getDefaultPayload() {
  return {
    competition: {
      status: "waiting",
      startedAt: "",
      maxParticipants: 5,
    },
    participants: [],
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createSupabaseHeaders(config) {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    "Content-Type": "application/json",
  };
}

function createTableUrl(config, query = "") {
  const baseUrl = config.supabaseUrl.replace(/\/$/, "");
  return `${baseUrl}/rest/v1/${TABLE_NAME}${query}`;
}

function getCacheKey(config) {
  return `${config.supabaseUrl}|${config.stateId}`;
}

function createPayloadEtag(payload) {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("base64url");
  return `"${hash.slice(0, 32)}"`;
}

function stripPayloadAvatars(payload) {
  return {
    ...payload,
    participants: Array.isArray(payload?.participants)
      ? payload.participants.map(({ avatar, ...participant }) => participant)
      : [],
  };
}

function findParticipantAvatar(payload, participantId) {
  const participant = Array.isArray(payload?.participants)
    ? payload.participants.find((item) => item.id === participantId)
    : null;
  return participant?.avatar || "";
}

function mergePayloadForWrite(existingPayload, incomingPayload) {
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

function updateStateCache(config, payload) {
  stateCache = {
    cacheKey: getCacheKey(config),
    etag: createPayloadEtag(payload),
    fetchedAt: Date.now(),
    payload,
  };
}

async function fetchState(config, options = {}) {
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

async function writeState(config, payload) {
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

export default async function handler(request, response) {
  const config = getEnvConfig();

  if (!config.supabaseUrl || !config.supabaseKey) {
    json(response, 500, { error: "missing_supabase_config" });
    return;
  }

  try {
    if (request.method === "GET") {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const payload = await fetchState(config);
      if (payload) {
        const avatarParticipantId = requestUrl.searchParams.get("avatar");
        if (avatarParticipantId) {
          const avatar = findParticipantAvatar(payload, avatarParticipantId);
          const avatarBody = { id: avatarParticipantId, avatar };
          const avatarEtag = createPayloadEtag(avatarBody);
          if (request.headers["if-none-match"] === avatarEtag) {
            notModified(response, avatarEtag);
            return;
          }

          json(response, avatar ? 200 : 404, avatarBody, {
            "Cache-Control": "no-cache",
            ETag: avatarEtag,
          });
          return;
        }

        const publicPayload = stripPayloadAvatars(payload);
        const etag = createPayloadEtag(publicPayload);
        if (request.headers["if-none-match"] === etag) {
          notModified(response, etag);
          return;
        }

        json(response, 200, { payload: publicPayload }, {
          "Cache-Control": "no-cache",
          ETag: etag,
        });
        return;
      }

      const defaultPayload = getDefaultPayload();
      await writeState(config, defaultPayload);
      json(response, 200, { payload: defaultPayload }, {
        "Cache-Control": "no-cache",
        ETag: createPayloadEtag(stripPayloadAvatars(defaultPayload)),
      });
      return;
    }

    if (request.method === "PUT") {
      const body = await readRequestBody(request);
      if (!body?.payload || typeof body.payload !== "object") {
        json(response, 400, { error: "invalid_payload" });
        return;
      }

      const existingPayload = await fetchState(config, { forceFresh: true });
      const mergedPayload = mergePayloadForWrite(existingPayload, body.payload);
      await writeState(config, mergedPayload);
      json(response, 200, { ok: true }, {
        ETag: createPayloadEtag(stripPayloadAvatars(mergedPayload)),
      });
      return;
    }

    response.setHeader("Allow", "GET, PUT");
    json(response, 405, { error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    json(response, 502, { error: "state_sync_failed" });
  }
}
