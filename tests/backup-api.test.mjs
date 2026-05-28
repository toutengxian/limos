import assert from "node:assert/strict";
import { test } from "node:test";

import backupHandler from "../api/backup.js";
import {
  createJsonRequest,
  createResponse,
  supabaseResponse,
  withEnv,
  withMockFetch,
  withSupabaseEnv,
} from "./http-test-utils.mjs";

function statePayload() {
  return {
    competition: { status: "active", startedAt: "2026-05-14", maxParticipants: 5 },
    participants: [{ id: "p1", name: "A", entries: [] }],
  };
}

function weightRows() {
  return [{
    participant_id: "p1",
    entry_date: "2026-05-15",
    weight: "78.8",
    created_at: "2026-05-15T00:00:00.000Z",
    updated_at: "2026-05-15T01:00:00.000Z",
    mutation_id: "m1",
  }];
}

test("backup GET writes a merged scheduled snapshot", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch((call) => {
      if (call.url.includes("limos_state_backups")) {
        return supabaseResponse(null, { status: 201 });
      }
      if (call.url.includes("limos_weight_entries")) {
        return supabaseResponse(weightRows());
      }
      return supabaseResponse([{ payload: statePayload(), updated_at: "2026-05-14T00:00:00.000Z" }]);
    }, async (calls) => {
      const response = createResponse();
      await backupHandler(createJsonRequest({}, { method: "GET", url: "/api/backup", rawBody: "" }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().ok, true);
      assert.equal(response.json().participantCount, 1);
      assert.equal(response.json().weightEntryCount, 1);
      assert.equal(calls.length, 3);

      const snapshotBody = JSON.parse(calls[2].options.body);
      assert.equal(snapshotBody.source, "scheduled");
      assert.equal(snapshotBody.payload.participants[0].entries[0].weight, 78.8);
      assert.equal(snapshotBody.weight_entries.length, 1);
    });
  });
});

test("backup rejects invalid token before touching Supabase", async () => {
  await withSupabaseEnv(async () => {
    await withEnv({ LIMOS_BACKUP_TOKEN: "secret" }, async () => {
      await withMockFetch(() => {
        throw new Error("fetch should not be called");
      }, async (calls) => {
        const response = createResponse();
        await backupHandler(createJsonRequest({}, { method: "POST", url: "/api/backup", rawBody: "" }), response);

        assert.equal(response.statusCode, 401);
        assert.deepEqual(response.json(), { error: "invalid_backup_token" });
        assert.equal(calls.length, 0);
      });
    });
  });
});
