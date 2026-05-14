import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import stateHandler from "../api/state.js";

const ROOT_DIR = fileURLToPath(new URL("../", import.meta.url));
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const STATIC_FILES = new Set(["index.html", "styles.css", "app.js", "config.js"]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function getPathname(request) {
  const host = request.headers.host || "localhost";
  return new URL(request.url || "/", `http://${host}`).pathname;
}

function getStaticFile(pathname) {
  if (pathname === "/") return "index.html";

  const requested = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]/, "");
  if (requested.includes("..")) return "";
  if (STATIC_FILES.has(requested)) return requested;

  return extname(requested) ? "" : "index.html";
}

function setStaticHeaders(response, filename) {
  const extension = extname(filename);
  response.setHeader("Content-Type", MIME_TYPES[extension] || "application/octet-stream");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (filename === "config.js") {
    response.setHeader("Cache-Control", "no-store");
    return;
  }

  if (filename === "index.html") {
    response.setHeader("Cache-Control", "no-cache");
    return;
  }

  response.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
}

async function serveStatic(request, response, filename) {
  try {
    const body = await readFile(join(ROOT_DIR, filename));
    setStaticHeaders(response, filename);
    response.statusCode = 200;
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(body);
  } catch (error) {
    console.error(error);
    sendJson(response, 404, { error: "not_found" });
  }
}

const server = createServer(async (request, response) => {
  const pathname = getPathname(request);

  if (pathname === "/healthz") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/state") {
    await stateHandler(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const filename = getStaticFile(pathname);
  if (!filename) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  await serveStatic(request, response, filename);
});

server.listen(PORT, HOST, () => {
  console.log(`Limos server listening on http://${HOST}:${PORT}`);
});
