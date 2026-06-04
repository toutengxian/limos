import {
  createPayloadEtag,
  getDefaultPayload,
  mergePayloadForWrite,
  stripPayloadAvatars,
} from "./payload-utils.js";
import { readRequestBody } from "./request-utils.js";
import {
  fetchStateRecord,
  getEnvConfig,
  hasSupabaseConfig,
  writeState,
} from "./supabase-store.js";
import { sendJson, sendMethodNotAllowed } from "./http-utils.js";
import {
  joinParticipant,
  removeParticipant,
  updateParticipantProfile,
} from "./member-domain.js";

export {
  joinParticipant,
  removeParticipant,
  updateParticipantProfile,
} from "./member-domain.js";

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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const record = await fetchStateRecord(config, { forceFresh: true }) || { payload: getDefaultPayload(), updatedAt: "" };
      const result = applyMemberAction(record.payload, body);
      if (!result.ok) {
        sendJson(response, result.status || 400, { error: result.error || "member_update_failed" });
        return;
      }

      const mergedPayload = mergePayloadForWrite(record.payload, result.payload);
      try {
        await writeState(config, mergedPayload, record.updatedAt ? { expectedUpdatedAt: record.updatedAt } : {});
        const publicPayload = stripPayloadAvatars(mergedPayload);
        sendJson(response, 200, { ok: true, payload: publicPayload }, {
          ETag: createPayloadEtag(publicPayload),
        });
        return;
      } catch (error) {
        if (error.code === "state_write_conflict" && attempt === 0) continue;
        throw error;
      }
    }
  } catch (error) {
    console.error(error);
    sendJson(response, 502, { error: "member_sync_failed" });
  }
}

function applyMemberAction(payload, body) {
  if (body?.action === "join") {
    const inviteResult = validateJoinInviteCode(body.inviteCode);
    if (!inviteResult.ok) return inviteResult;
    return joinParticipant(payload, body.participant);
  }
  if (body?.action === "profile") {
    return updateParticipantProfile(payload, String(body.participantId || ""), body.profile);
  }
  if (body?.action === "remove") {
    return removeParticipant(payload, String(body.participantId || ""));
  }
  return { ok: false, status: 400, error: "invalid_action" };
}

function validateJoinInviteCode(input) {
  const configuredCode = String(process.env.LIMOS_JOIN_CODE || process.env.LIMOS_INVITE_CODE || "").trim();
  if (!configuredCode) return { ok: true };

  const submittedCode = String(input || "").trim();
  if (submittedCode && submittedCode === configuredCode) return { ok: true };

  return { ok: false, status: 403, error: "invalid_invite_code" };
}
