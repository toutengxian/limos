import {
  fetchState,
  fetchWeightEntryRows,
  getEnvConfig,
  hasSupabaseConfig,
} from "./state-store.js";

function json(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function timeCheck(name, run) {
  const startedAt = Date.now();
  try {
    const detail = await run();
    return {
      name,
      ok: true,
      ms: Date.now() - startedAt,
      ...detail,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - startedAt,
      error: error.message,
    };
  }
}

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    json(response, 405, { error: "method_not_allowed" });
    return;
  }

  const config = getEnvConfig();
  const version = process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.LIMOS_RELEASE
    || process.env.npm_package_version
    || "local";

  if (!hasSupabaseConfig(config)) {
    json(response, 500, {
      ok: false,
      version,
      stateId: config.stateId,
      checks: [{ name: "supabase_config", ok: false, error: "missing_supabase_config" }],
    });
    return;
  }

  const checks = [
    {
      name: "supabase_config",
      ok: true,
      stateId: config.stateId,
      supabaseHost: safeHost(config.supabaseUrl),
    },
    await timeCheck("state_read", async () => {
      const payload = await fetchState(config, { forceFresh: true });
      return {
        hasPayload: Boolean(payload),
        participantCount: Array.isArray(payload?.participants) ? payload.participants.length : 0,
      };
    }),
    await timeCheck("weight_entries_read", async () => {
      const rows = await fetchWeightEntryRows(config, { strict: true });
      return { rowCount: rows.length };
    }),
  ];

  const ok = checks.every((check) => check.ok);
  json(response, ok ? 200 : 502, {
    ok,
    version,
    stateId: config.stateId,
    checkedAt: new Date().toISOString(),
    checks,
  });
}

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}
