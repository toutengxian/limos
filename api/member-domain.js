import { getTodayISO } from "./date-utils.js";
import { getDefaultPayload } from "./payload-utils.js";

const MAX_COMPETITORS = 5;
const USER_ROLE_COMPETITOR = "competitor";
const USER_ROLE_SUPPORTER = "supporter";

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

function getActionDate(options = {}) {
  return getTodayISO(options.now || new Date());
}

function normalizePayload(payload, options = {}) {
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
      startedAt: status === "active" ? payload?.competition?.startedAt || getActionDate(options) : "",
    },
    participants,
  };
}

export function joinParticipant(payload, participantInput, options = {}) {
  const nextPayload = normalizePayload(payload || getDefaultPayload(), options);
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
  maybeStartCompetition(nextPayload, options);
  return { ok: true, payload: normalizePayload(nextPayload, options) };
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

function maybeStartCompetition(payload, options = {}) {
  if (isCompetitionActive(payload) || payload.participants.filter(isCompetitor).length < MAX_COMPETITORS) return;

  const startedAt = getActionDate(options);
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
