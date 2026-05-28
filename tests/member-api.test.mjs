import assert from "node:assert/strict";
import { test } from "node:test";

import memberHandler from "../api/member.js";
import {
  createJsonRequest,
  createResponse,
  supabaseResponse,
  withMockFetch,
  withSupabaseEnv,
} from "./http-test-utils.mjs";

function participantInput(id, name) {
  return {
    id,
    name,
    color: "#1f7a5c",
    initialWeight: 80,
    heightCm: 170,
    avatar: "data:image/png;base64,abc",
    userRole: "competitor",
    accessCodeHash: `hash-${id}`,
  };
}

test("member POST join writes the full payload and returns avatar-stripped payload", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch((call) => {
      if (call.options.method === "PATCH") {
        return supabaseResponse([{ id: process.env.LIMOS_STATE_ID }]);
      }
      return supabaseResponse([{
        payload: {
          competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
          participants: [],
        },
        updated_at: "2026-05-14T00:00:00.000Z",
      }]);
    }, async (calls) => {
      const response = createResponse();
      await memberHandler(createJsonRequest({
        action: "join",
        participant: participantInput("p1", "A"),
      }, { method: "POST", url: "/api/member" }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].options.method, "PATCH");

      const writtenPayload = JSON.parse(calls[1].options.body).payload;
      assert.equal(writtenPayload.participants[0].avatar, "data:image/png;base64,abc");

      const responseParticipant = response.json().payload.participants[0];
      assert.equal(responseParticipant.name, "A");
      assert.equal(responseParticipant.avatar, undefined);
      assert.ok(response.headers.etag);
    });
  });
});

test("member POST invalid action returns a 400 without writing state", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch(() => {
      return supabaseResponse([{
        payload: {
          competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
          participants: [],
        },
        updated_at: "2026-05-14T00:00:00.000Z",
      }]);
    }, async (calls) => {
      const response = createResponse();
      await memberHandler(createJsonRequest({ action: "nope" }, { method: "POST", url: "/api/member" }), response);

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), { error: "invalid_action" });
      assert.equal(calls.length, 1);
    });
  });
});
