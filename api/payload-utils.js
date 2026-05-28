import { createHash } from "node:crypto";

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
      ...(entry.updatedAt ? { updatedAt: entry.updatedAt } : {}),
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
