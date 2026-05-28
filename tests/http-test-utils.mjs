import { Readable } from "node:stream";

export function createJsonRequest(body = {}, options = {}) {
  const requestBody = options.rawBody ?? JSON.stringify(body);
  const request = Readable.from(requestBody ? [Buffer.from(requestBody)] : []);
  request.method = options.method || "POST";
  request.url = options.url || "/";
  request.headers = normalizeHeaders(options.headers || {});
  return request;
}

export function createResponse() {
  return {
    body: "",
    headers: {},
    statusCode: 0,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body = "") {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

export function supabaseResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status || 200,
    json: async () => body,
  };
}

export async function withSupabaseEnv(run, overrides = {}) {
  return withEnv({
    LIMOS_SUPABASE_URL: Object.hasOwn(overrides, "supabaseUrl") ? overrides.supabaseUrl : "https://unit-test.supabase.co",
    LIMOS_SUPABASE_ANON_KEY: Object.hasOwn(overrides, "supabaseKey") ? overrides.supabaseKey : "test-key",
    LIMOS_SUPABASE_SERVICE_ROLE_KEY: Object.hasOwn(overrides, "serviceRoleKey") ? overrides.serviceRoleKey : undefined,
    LIMOS_STATE_ID: Object.hasOwn(overrides, "stateId") ? overrides.stateId : `test-${Date.now()}-${Math.random()}`,
  }, run);
}

export async function withEnv(overrides, run) {
  const previousEnv = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });

  try {
    return await run();
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
}

export async function withMockFetch(fetchImpl, run) {
  const previousFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const call = { url: String(url), options };
    calls.push(call);
    return fetchImpl(call, calls);
  };

  try {
    return await run(calls);
  } finally {
    global.fetch = previousFetch;
  }
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}
