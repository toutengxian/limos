import {
  createPayloadEtag,
  fetchStateRecord,
  getDefaultPayload,
  getEnvConfig,
  hasSupabaseConfig,
  mergePayloadForWrite,
  readRequestBody,
  stripPayloadAvatars,
  writeState,
} from "./state-store.js";

const MAX_COMPETITORS = 5;
const USER_ROLE_COMPETITOR = "competitor";
const USER_ROLE_SUPPORTER = "supporter";

function json(response, statusCode, body, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", headers["Cache-Control"] || "no-store");
  Object.entries(headers).forEach(([key, value]) => {
    if (key !== "Cache-Control") response.setHeader(key, value);
  });
  response.end(JSON.stringify(body));
}

function isValidWeight(value) {
  return Number.isFinite(value) && value >= 30 && value <= 250;
}

function isValidHeight(value) {
  return Number.isFinite(value) && value >= 100 && value <= 230;
}

function normalizeRole(role) {
  return role === USER_ROLE_SUPPORTER ? USER_ROLE_SUPPORTER : USER_ROLE_COMPETITOR;
}

function isCompetitor(participant) {
  return normalizeRole(participant?.userRole || participant?.role) === USER_ROLE_COMPETITOR;
}

function normalizeParticipant(input) {
  const initialWeight = Number(input?.initialWeight);
  const heightCm = Number(input?.heightCm);
  return {
    id: String(input?.id || ""),
    name: String(input?.name || "").trim(),
    color: String(input?.color || ""),
    initialWeight: Math.round(initialWeight * 10) / 10,
    heightCm: Math.round(heightCm * 10) / 10,
    avatar: input?.avatar || "",
    userRole: normalizeRole(input?.userRole || input?.role),
    accessCodeHash: String(input?.accessCodeHash || ""),
    joinedAt: input?.joinedAt || new Date().toISOString(),
    entries: Array.isArray(input?.entries) ? input.entries : [],
  };
}

function normalizePayload(payload) {
  const fallback = getDefaultPayload();
  const participants = Array.isArray(payload?.participants) ? payload.participants : [];
  const competitorCount = participants.filter(isCompetitor).length;
  const status = competitorCount >= MAX_COMPETITORS ? "active" : "waiting";
  return {
    competition: {
      ...fallback.competition,
      ...payload?.competition,
      status,
      maxParticipants: MAX_COMPETITORS,
      startedAt: status === "active" ? payload?.competition?.startedAt || getTodayISO() : "",
    },
    participants,
  };
}

export function joinParticipant(payload, participantInput) {
  const nextPayload = normalizePayload(payload || getDefaultPayload());
  const participant = normalizeParticipant(participantInput);
  if (!participant.id || !participant.name || !isValidWeight(participant.initialWeight) || !isValidHeight(participant.heightCm) || !participant.accessCodeHash) {
    return { ok: false, status: 400, error: "invalid_participant" };
  }

  const nameTaken = nextPayload.participants.some((item) => item.name === participant.name || item.id === participant.id);
  if (nameTaken) return { ok: false, status: 409, error: "participant_exists" };

  if (isCompetitor(participant) && nextPayload.participants.filter(isCompetitor).length >= MAX_COMPETITORS) {
    return { ok: false, status: 409, error: "competitor_slots_full" };
  }

  nextPayload.participants.push(participant);
  maybeStartCompetition(nextPayload);
  return { ok: true, payload: normalizePayload(nextPayload) };
}

export function updateParticipantProfile(payload, participantId, profileInput) {
  const nextPayload = normalizePayload(payload || getDefaultPayload());
  const participant = nextPayload.participants.find((item) => item.id === participantId);
  if (!participant) return { ok: false, status: 404, error: "participant_not_found" };

  const name = String(profileInput?.name || "").trim();
  const heightCm = Number(profileInput?.heightCm);
  if (!name || !isValidHeight(heightCm)) return { ok: false, status: 400, error: "invalid_profile" };

  const nameTaken = nextPayload.participants.some((item) => item.id !== participantId && item.name === name);
  if (nameTaken) return { ok: false, status: 409, error: "participant_name_exists" };

  participant.name = name;
  participant.heightCm = Math.round(heightCm * 10) / 10;
  if (profileInput?.color) participant.color = String(profileInput.color);
  if (profileInput?.avatar) participant.avatar = profileInput.avatar;
  return { ok: true, payload: normalizePayload(nextPayload) };
}

export function removeParticipant(payload, participantId) {
  const nextPayload = normalizePayload(payload || getDefaultPayload());
  if (isCompetitionActive(nextPayload)) {
    return { ok: false, status: 409, error: "competition_active" };
  }

  const existingCount = nextPayload.participants.length;
  nextPayload.participants = nextPayload.participants.filter((participant) => participant.id !== participantId);
  if (nextPayload.participants.length === existingCount) {
    return { ok: false, status: 404, error: "participant_not_found" };
  }

  nextPayload.competition = {
    status: "waiting",
    startedAt: "",
    maxParticipants: MAX_COMPETITORS,
  };
  return { ok: true, payload: normalizePayload(nextPayload) };
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const record = await fetchStateRecord(config, { forceFresh: true }) || { payload: getDefaultPayload(), updatedAt: "" };
      const result = applyMemberAction(record.payload, body);
      if (!result.ok) {
        json(response, result.status || 400, { error: result.error || "member_update_failed" });
        return;
      }

      const mergedPayload = mergePayloadForWrite(record.payload, result.payload);
      try {
        await writeState(config, mergedPayload, record.updatedAt ? { expectedUpdatedAt: record.updatedAt } : {});
        const publicPayload = stripPayloadAvatars(mergedPayload);
        json(response, 200, { ok: true, payload: publicPayload }, {
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
    json(response, 502, { error: "member_sync_failed" });
  }
}

function applyMemberAction(payload, body) {
  if (body?.action === "join") {
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

function maybeStartCompetition(payload) {
  if (isCompetitionActive(payload) || payload.participants.filter(isCompetitor).length < MAX_COMPETITORS) return;

  const startedAt = getTodayISO();
  payload.competition = {
    status: "active",
    startedAt,
    maxParticipants: MAX_COMPETITORS,
  };

  payload.participants.filter(isCompetitor).forEach((participant) => {
    if (!Array.isArray(participant.entries)) participant.entries = [];
    if (participant.entries.some((entry) => entry.date === startedAt)) return;
    participant.entries.push({
      date: startedAt,
      weight: participant.initialWeight,
      createdAt: new Date().toISOString(),
      type: "start",
    });
  });
}

function isCompetitionActive(payload) {
  return payload?.competition?.status === "active"
    && Array.isArray(payload?.participants)
    && payload.participants.filter(isCompetitor).length >= MAX_COMPETITORS;
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}
