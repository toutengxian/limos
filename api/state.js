import {
  createPayloadEtag,
  fetchState,
  fetchWeightEntryRows,
  findParticipantAvatar,
  getDefaultPayload,
  getEnvConfig,
  hasSupabaseConfig,
  mergeWeightEntriesIntoPayload,
  mergePayloadForWrite,
  readRequestBody,
  stripPayloadAvatars,
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

function notModified(response, etag) {
  response.statusCode = 304;
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("ETag", etag);
  response.end();
}

export default async function handler(request, response) {
  const config = getEnvConfig();

  if (!hasSupabaseConfig(config)) {
    json(response, 500, { error: "missing_supabase_config" });
    return;
  }

  try {
    if (request.method === "GET") {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const payload = await fetchState(config);
      if (payload) {
        mergeWeightEntriesIntoPayload(payload, await fetchWeightEntryRows(config));
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
