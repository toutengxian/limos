import assert from "node:assert/strict";
import { test } from "node:test";

import {
  joinParticipant,
  removeParticipant,
  updateParticipantProfile,
} from "../api/member-domain.js";

function participant(id, name, role = "competitor") {
  return {
    id,
    name,
    color: "#1f7a5c",
    initialWeight: 80,
    heightCm: 170,
    userRole: role,
    accessCodeHash: `hash-${id}`,
    joinedAt: "2026-05-14T00:00:00.000Z",
    entries: [],
  };
}

test("joinParticipant starts the competition when the fifth competitor joins", () => {
  const payload = {
    competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
    participants: [
      participant("p1", "A"),
      participant("p2", "B"),
      participant("p3", "C"),
      participant("p4", "D"),
    ],
  };

  const result = joinParticipant(payload, participant("p5", "E"));

  assert.equal(result.ok, true);
  assert.equal(result.payload.competition.status, "active");
  assert.equal(result.payload.participants.filter((item) => item.entries.length === 1).length, 5);
});

test("joinParticipant uses Beijing date when the competition starts", () => {
  const payload = {
    competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
    participants: [
      participant("p1", "A"),
      participant("p2", "B"),
      participant("p3", "C"),
      participant("p4", "D"),
    ],
  };

  const result = joinParticipant(payload, participant("p5", "E"), {
    now: new Date("2026-05-13T16:30:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.competition.startedAt, "2026-05-14");
  assert.equal(result.payload.participants[0].entries[0].date, "2026-05-14");
});

test("joinParticipant rejects duplicate names", () => {
  const payload = {
    competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
    participants: [participant("p1", "A")],
  };

  const result = joinParticipant(payload, participant("p2", "A"));

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});

test("joinParticipant requires height", () => {
  const payload = {
    competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
    participants: [],
  };
  const missingHeight = participant("p1", "A");
  delete missingHeight.heightCm;

  const result = joinParticipant(payload, missingHeight);

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
});

test("updateParticipantProfile updates only the target participant", () => {
  const payload = {
    competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
    participants: [participant("p1", "A"), participant("p2", "B", "supporter")],
  };

  const result = updateParticipantProfile(payload, "p2", {
    name: "B+",
    heightCm: 168,
    color: "#456cf6",
    avatar: "data:image/png;base64,abc",
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.participants[0].name, "A");
  assert.equal(result.payload.participants[1].name, "B+");
  assert.equal(result.payload.participants[1].heightCm, 168);
  assert.equal(result.payload.participants[1].avatar, "data:image/png;base64,abc");
});

test("removeParticipant refuses active competitions", () => {
  const payload = {
    competition: { status: "active", startedAt: "2026-05-14", maxParticipants: 5 },
    participants: [
      participant("p1", "A"),
      participant("p2", "B"),
      participant("p3", "C"),
      participant("p4", "D"),
      participant("p5", "E"),
    ],
  };

  const result = removeParticipant(payload, "p5");

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
});
