import assert from "node:assert/strict";
import { test } from "node:test";

import weightEntryHandler from "../api/weight-entry.js";
import {
  createJsonRequest,
  createResponse,
  supabaseResponse,
  withMockFetch,
  withSupabaseEnv,
} from "./http-test-utils.mjs";

function statePayload() {
  return {
    competition: { status: "active", startedAt: "2026-05-14", maxParticipants: 5 },
    participants: [{ id: "p1", name: "A", initialWeight: 80, entries: [] }],
  };
}

test("weight entry rejects unknown participants before writing the entry row", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch(() => {
      return supabaseResponse([{ payload: statePayload(), updated_at: "2026-05-14T00:00:00.000Z" }]);
    }, async (calls) => {
      const response = createResponse();
      await weightEntryHandler(createJsonRequest({
        participantId: "missing",
        date: "2026-05-15",
        weight: 79.5,
      }, { method: "POST", url: "/api/weight-entry" }), response);

      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json(), { error: "participant_not_found" });
      assert.equal(calls.length, 1);
      assert.equal(calls.some((call) => call.url.includes("limos_weight_entries")), false);
    });
  });
});

test("weight entry writes a row after participant validation", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch((call) => {
      if (call.url.includes("limos_weight_entries")) {
        return supabaseResponse(null, { status: 201 });
      }
      return supabaseResponse([{ payload: statePayload(), updated_at: "2026-05-14T00:00:00.000Z" }]);
    }, async (calls) => {
      const response = createResponse();
      await weightEntryHandler(createJsonRequest({
        participantId: "p1",
        date: "2026-05-15",
        weight: 79.5,
        mutationId: "m1",
      }, { method: "POST", url: "/api/weight-entry" }), response);

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ok: true, mode: "entry" });
      assert.equal(calls.length, 2);
      assert.equal(calls[1].url.includes("limos_weight_entries"), true);
      assert.equal(JSON.parse(calls[1].options.body).participant_id, "p1");
    });
  });
});
