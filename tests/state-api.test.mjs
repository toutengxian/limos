import assert from "node:assert/strict";
import { test } from "node:test";

import stateHandler from "../api/state.js";
import { createAvatarSignature } from "../api/payload-utils.js";
import {
  createJsonRequest,
  createResponse,
  supabaseResponse,
  withMockFetch,
  withSupabaseEnv,
} from "./http-test-utils.mjs";

test("state GET merges weight rows without mutating the cached payload object", async () => {
  await withSupabaseEnv(async () => {
    const storedPayload = {
      competition: { status: "active", startedAt: "2026-05-14", maxParticipants: 5 },
      participants: [{
        id: "p1",
        name: "A",
        avatar: "data:image/png;base64,abc",
        entries: [],
      }],
    };
    const weightRows = [{
      participant_id: "p1",
      entry_date: "2026-05-15",
      weight: "78.8",
      created_at: "2026-05-15T00:00:00.000Z",
      updated_at: "2026-05-15T01:00:00.000Z",
      mutation_id: "m1",
    }];

    await withMockFetch((call) => {
      if (call.url.includes("limos_weight_entries")) {
        return supabaseResponse(weightRows);
      }
      return supabaseResponse([{ payload: storedPayload, updated_at: "2026-05-14T00:00:00.000Z" }]);
    }, async (calls) => {
      const response = createResponse();
      await stateHandler(createJsonRequest({}, { method: "GET", url: "/api/state", rawBody: "" }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["cache-control"], "no-cache");
      assert.equal(calls.length, 2);
      assert.equal(calls[1].url.includes("limos_weight_entries"), true);

      const participant = response.json().payload.participants[0];
      assert.equal(participant.avatar, undefined);
      assert.equal(participant.avatarSignature, createAvatarSignature("data:image/png;base64,abc"));
      assert.deepEqual(participant.entries, [{
        date: "2026-05-15",
        weight: 78.8,
        createdAt: "2026-05-15T00:00:00.000Z",
        updatedAt: "2026-05-15T01:00:00.000Z",
        mutationId: "m1",
      }]);
      assert.deepEqual(storedPayload.participants[0].entries, []);
    });
  });
});

test("state GET avatar endpoint returns only the requested avatar", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch((call) => {
      if (call.url.includes("limos_weight_entries")) {
        return supabaseResponse([]);
      }
      return supabaseResponse([{
        payload: {
          competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
          participants: [{ id: "p1", name: "A", avatar: "data:image/png;base64,abc", entries: [] }],
        },
        updated_at: "2026-05-14T00:00:00.000Z",
      }]);
    }, async () => {
      const response = createResponse();
      await stateHandler(createJsonRequest({}, { method: "GET", url: "/api/state?avatar=p1", rawBody: "" }), response);

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        id: "p1",
        avatar: "data:image/png;base64,abc",
        avatarSignature: createAvatarSignature("data:image/png;base64,abc"),
      });
      assert.ok(response.headers.etag);
    });
  });
});

test("state PUT preserves existing avatars while writing incoming payload", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch((call) => {
      if (call.options.method === "POST") {
        return supabaseResponse(null, { status: 201 });
      }
      return supabaseResponse([{
        payload: {
          competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
          participants: [{
            id: "p1",
            name: "A",
            avatar: "data:image/png;base64,abc",
            entries: [],
          }],
        },
        updated_at: "2026-05-14T00:00:00.000Z",
      }]);
    }, async (calls) => {
      const response = createResponse();
      await stateHandler(createJsonRequest({
        payload: {
          competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
          participants: [{
            id: "p1",
            name: "A+",
            entries: [],
          }],
        },
      }, { method: "PUT", url: "/api/state" }), response);

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ok: true });
      assert.equal(calls.length, 2);
      assert.equal(calls[1].options.method, "POST");

      const writtenPayload = JSON.parse(calls[1].options.body).payload;
      assert.equal(writtenPayload.participants[0].name, "A+");
      assert.equal(writtenPayload.participants[0].avatar, "data:image/png;base64,abc");
      assert.ok(response.headers.etag);
    });
  });
});
