const TABLE_NAME = "fat_battle_state";

function getEnvConfig() {
  return {
    supabaseUrl: process.env.LIMOS_SUPABASE_URL || "",
    supabaseKey: process.env.LIMOS_SUPABASE_SERVICE_ROLE_KEY || process.env.LIMOS_SUPABASE_ANON_KEY || "",
    stateId: process.env.LIMOS_STATE_ID || "limos-2026",
  };
}

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
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

async function fetchState(config) {
  const query = `?id=eq.${encodeURIComponent(config.stateId)}&select=payload`;
  const response = await fetch(createTableUrl(config, query), {
    headers: createSupabaseHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`Supabase read failed: ${response.status}`);
  }

  const rows = await response.json();
  return rows[0]?.payload || null;
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
}

export default async function handler(request, response) {
  const config = getEnvConfig();

  if (!config.supabaseUrl || !config.supabaseKey) {
    json(response, 500, { error: "missing_supabase_config" });
    return;
  }

  try {
    if (request.method === "GET") {
      const payload = await fetchState(config);
      if (payload) {
        json(response, 200, { payload });
        return;
      }

      const defaultPayload = getDefaultPayload();
      await writeState(config, defaultPayload);
      json(response, 200, { payload: defaultPayload });
      return;
    }

    if (request.method === "PUT") {
      const body = await readRequestBody(request);
      if (!body?.payload || typeof body.payload !== "object") {
        json(response, 400, { error: "invalid_payload" });
        return;
      }

      await writeState(config, body.payload);
      json(response, 200, { ok: true });
      return;
    }

    response.setHeader("Allow", "GET, PUT");
    json(response, 405, { error: "method_not_allowed" });
  } catch (error) {
    console.error(error);
    json(response, 502, { error: "state_sync_failed" });
  }
}
