import assert from "node:assert/strict";
import { test } from "node:test";

import diagnosticsHandler from "../api/diagnostics.js";
import {
  createJsonRequest,
  createResponse,
  supabaseResponse,
  withMockFetch,
  withSupabaseEnv,
} from "./http-test-utils.mjs";

test("diagnostics GET reports Supabase health checks", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch((call) => {
      if (call.url.includes("limos_weight_entries")) {
        return supabaseResponse([{ participant_id: "p1" }]);
      }
      return supabaseResponse([{
        payload: {
          competition: { status: "waiting", startedAt: "", maxParticipants: 5 },
          participants: [{ id: "p1", name: "A", entries: [] }],
        },
        updated_at: "2026-05-14T00:00:00.000Z",
      }]);
    }, async (calls) => {
      const response = createResponse();
      await diagnosticsHandler(createJsonRequest({}, { method: "GET", url: "/api/diagnostics", rawBody: "" }), response);

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().ok, true);
      assert.equal(response.json().checks[0].name, "supabase_config");
      assert.equal(response.json().checks[0].supabaseHost, "unit-test.supabase.co");
      assert.equal(response.json().checks[1].participantCount, 1);
      assert.equal(response.json().checks[2].rowCount, 1);
      assert.equal(calls.length, 2);
    });
  });
});

test("diagnostics reports missing Supabase config without fetching", async () => {
  await withSupabaseEnv(async () => {
    await withMockFetch(() => {
      throw new Error("fetch should not be called");
    }, async (calls) => {
      const response = createResponse();
      await diagnosticsHandler(createJsonRequest({}, { method: "GET", url: "/api/diagnostics", rawBody: "" }), response);

      assert.equal(response.statusCode, 500);
      assert.equal(response.json().ok, false);
      assert.deepEqual(response.json().checks, [{
        name: "supabase_config",
        ok: false,
        error: "missing_supabase_config",
      }]);
      assert.equal(calls.length, 0);
    });
  }, { supabaseUrl: "", supabaseKey: "" });
});
