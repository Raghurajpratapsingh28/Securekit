#!/usr/bin/env node
/**
 * Phase 12 — production smoke test against a real HTTP server.
 */
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { securekit } from "../packages/core/dist/index.js";
import {
  createSecureKitContext,
  createReadonlyHeaderMap,
  mergeResponseHeaders,
  readResponseHeaders,
} from "../packages/core/dist/internal.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function createKit(rateLimit = 100) {
  return securekit({
    headers: true,
    cors: { origins: ["https://app.example.com"] },
    bodyLimit: "1kb",
    rateLimit: { limit: rateLimit, window: 60_000 },
    requestId: true,
    apiKey: {
      validate: async (key) => (key === "smoke-test-key" ? { id: "smoke" } : null),
    },
  });
}

async function withServer(kit, fn) {
  const server = createServer(async (req, res) => {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      headers[name] = Array.isArray(value) ? value.join(", ") : value;
    }

    const ctx = createSecureKitContext({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: createReadonlyHeaderMap(headers),
      remoteAddress: req.socket.remoteAddress,
    });

    const result = await kit.handle(ctx);
    const merged = mergeResponseHeaders(ctx, result);

    if (merged.kind === "respond") {
      res.statusCode = merged.status;
      if (merged.headers) {
        for (const [k, v] of Object.entries(merged.headers)) res.setHeader(k, v);
      }
      res.end(merged.body ?? "");
      return;
    }

    for (const [k, v] of Object.entries(readResponseHeaders(ctx.responseHeaders))) {
      res.setHeader(k, v);
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain");
    res.end("ok");
  });

  await new Promise((resolve, reject) => {
    server.listen(0, (err) => (err ? reject(err) : resolve()));
  });

  const port = server.address().port;

  async function request(path, headers = {}) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { origin: "https://app.example.com", ...headers },
    });
    const body = await res.text();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
  }

  try {
    await fn({ request, port });
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    kit.destroy();
  }
}

await withServer(createKit(100), async ({ request, port }) => {
  const ok = await request("/", { "x-api-key": "smoke-test-key" });
  if (ok.status !== 200) throw new Error(`valid request expected 200, got ${ok.status}`);
  if (!ok.headers["x-request-id"]) throw new Error("missing x-request-id on success");

  const noKey = await request("/");
  if (noKey.status !== 401) throw new Error(`missing key expected 401, got ${noKey.status}`);

  const badOrigin = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { origin: "https://evil.example", "x-api-key": "smoke-test-key" },
  });
  if (badOrigin.status !== 403) throw new Error(`bad origin expected 403, got ${badOrigin.status}`);
});

await withServer(createKit(1), async ({ request }) => {
  await request("/", { "x-api-key": "smoke-test-key" });
  const limited = await request("/", { "x-api-key": "smoke-test-key" });
  if (limited.status !== 429) throw new Error(`rate limit expected 429, got ${limited.status}`);
  if (!limited.headers["retry-after"]) throw new Error("missing retry-after on 429");
});

const audit = spawnSync(
  process.execPath,
  [
    join(repoRoot, "packages/cli/dist/cli.js"),
    "audit",
    "--inline",
    '{"headers":true,"bodyLimit":"1mb","rateLimit":{"limit":100,"window":60000}}',
  ],
  { encoding: "utf8" },
);

if (audit.status !== 0 && audit.status !== 1) {
  throw new Error(`CLI audit failed with exit ${audit.status}: ${audit.stderr}`);
}

console.log("Production smoke test: OK");
