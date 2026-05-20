import assert from "node:assert/strict";
import { test } from "node:test";

import {
  mergePayloadForWrite,
  mergeWeightEntriesIntoPayload,
  upsertPayloadWeightEntry,
} from "../api/state-store.js";

test("mergePayloadForWrite preserves existing avatars when incoming payload omits them", () => {
  const merged = mergePayloadForWrite(
    {
      participants: [{ id: "p1", name: "A", avatar: "data:image/png;base64,abc", entries: [] }],
    },
    {
      participants: [{ id: "p1", name: "A+", entries: [] }],
    },
  );

  assert.equal(merged.participants[0].avatar, "data:image/png;base64,abc");
  assert.equal(merged.participants[0].name, "A+");
});

test("upsertPayloadWeightEntry updates by participant and date", () => {
  const payload = {
    participants: [{
      id: "p1",
      entries: [{ date: "2026-05-14", weight: 80 }],
    }],
  };

  const updated = upsertPayloadWeightEntry(payload, "p1", {
    date: "2026-05-14",
    weight: 79.4,
    updatedAt: "2026-05-15T00:00:00.000Z",
    mutationId: "m1",
  });

  assert.equal(updated, true);
  assert.equal(payload.participants[0].entries.length, 1);
  assert.equal(payload.participants[0].entries[0].weight, 79.4);
  assert.equal(payload.participants[0].entries[0].mutationId, "m1");
});

test("mergeWeightEntriesIntoPayload ignores unknown participants and merges known rows", () => {
  const payload = {
    participants: [{ id: "p1", entries: [] }],
  };

  mergeWeightEntriesIntoPayload(payload, [
    {
      participant_id: "p1",
      entry_date: "2026-05-15",
      weight: "78.8",
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T00:00:00.000Z",
      mutation_id: "m2",
    },
    {
      participant_id: "missing",
      entry_date: "2026-05-15",
      weight: "88.8",
    },
  ]);

  assert.deepEqual(payload.participants[0].entries, [{
    date: "2026-05-15",
    weight: 78.8,
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z",
    mutationId: "m2",
  }]);
});
