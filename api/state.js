import {
  createAvatarSignature,
  createPayloadEtag,
  findParticipantAvatar,
  getDefaultPayload,
  mergeWeightEntriesIntoPayload,
  mergePayloadForWrite,
  stripPayloadAvatars,
} from "./payload-utils.js";
import { readRequestBody } from "./request-utils.js";
import {
  fetchState,
  fetchWeightEntryRows,
  getEnvConfig,
  hasSupabaseConfig,
  writeState,
} from "./supabase-store.js";
import { sendJson, sendMethodNotAllowed, sendNotModified } from "./http-utils.js";

export default async function handler(request, response) {
  const config = getEnvConfig();

  if (!hasSupabaseConfig(config)) {
    sendJson(response, 500, { error: "missing_supabase_config" });
    return;
  }

  try {
    if (request.method === "GET") {
      const requestUrl = new URL(request.url || "/", "http://localhost");
      const storedPayload = await fetchState(config);
      if (storedPayload) {
        const payload = structuredClone(storedPayload);
        mergeWeightEntriesIntoPayload(payload, await fetchWeightEntryRows(config));
        const avatarParticipantId = requestUrl.searchParams.get("avatar");
        if (avatarParticipantId) {
          const avatar = findParticipantAvatar(payload, avatarParticipantId);
          const avatarBody = { id: avatarParticipantId, avatar, avatarSignature: createAvatarSignature(avatar) };
          const avatarEtag = createPayloadEtag(avatarBody);
          if (request.headers["if-none-match"] === avatarEtag) {
            sendNotModified(response, avatarEtag);
            return;
          }

          sendJson(response, avatar ? 200 : 404, avatarBody, {
            "Cache-Control": "no-cache",
            ETag: avatarEtag,
          });
          return;
        }

        const publicPayload = stripPayloadAvatars(payload);
        const etag = createPayloadEtag(publicPayload);
        if (request.headers["if-none-match"] === etag) {
          sendNotModified(response, etag);
          return;
        }

        sendJson(response, 200, { payload: publicPayload }, {
          "Cache-Control": "no-cache",
          ETag: etag,
        });
        return;
      }

      const defaultPayload = getDefaultPayload();
      await writeState(config, defaultPayload);
      sendJson(response, 200, { payload: defaultPayload }, {
        "Cache-Control": "no-cache",
        ETag: createPayloadEtag(stripPayloadAvatars(defaultPayload)),
      });
      return;
    }

    if (request.method === "PUT") {
      const body = await readRequestBody(request);
      if (!body?.payload || typeof body.payload !== "object") {
        sendJson(response, 400, { error: "invalid_payload" });
        return;
      }

      const existingPayload = await fetchState(config, { forceFresh: true });
      const mergedPayload = mergePayloadForWrite(existingPayload, body.payload);
      await writeState(config, mergedPayload);
      sendJson(response, 200, { ok: true }, {
        ETag: createPayloadEtag(stripPayloadAvatars(mergedPayload)),
      });
      return;
    }

    sendMethodNotAllowed(response, ["GET", "PUT"]);
  } catch (error) {
    console.error(error);
    sendJson(response, 502, { error: "state_sync_failed" });
  }
}
