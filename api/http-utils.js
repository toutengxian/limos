export function sendJson(response, statusCode, body, headers = {}) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", headers["Cache-Control"] || "no-store");
  Object.entries(headers).forEach(([key, value]) => {
    if (key !== "Cache-Control") response.setHeader(key, value);
  });
  response.end(JSON.stringify(body));
}

export function sendMethodNotAllowed(response, allowedMethods) {
  response.setHeader("Allow", allowedMethods.join(", "));
  sendJson(response, 405, { error: "method_not_allowed" });
}

export function sendNotModified(response, etag) {
  response.statusCode = 304;
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("ETag", etag);
  response.end();
}
