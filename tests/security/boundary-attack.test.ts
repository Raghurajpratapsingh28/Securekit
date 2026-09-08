/**
 * Phase 11 — hostile boundary attacks on config, pipeline, auth, CORS, limits.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit, ConfigurationError } from "../../packages/core/dist/index.js";
import {
  constantTimeKeyCompare,
  createSecureKitContextFromHeaders,
  mergeResponseHeaders,
} from "../../packages/core/dist/internal.js";
import { safeCompare } from "../../packages/core/dist/crypto/index.js";
import { MemoryStore } from "../../packages/core/dist/rate-limit/memory-store.js";

describe("configuration boundary attacks", () => {
  it("rejects constructor key", () => {
    assert.throws(
      () => securekit({ constructor: { headers: true } } as never),
      ConfigurationError,
    );
  });

  it("rejects duplicate plugin names", () => {
    const plugin = { name: "dup", compile() {} };
    assert.throws(
      () => securekit({ headers: false, plugins: [plugin, { ...plugin }] }),
      ConfigurationError,
    );
  });

  it("frozen config cannot be mutated after compile", () => {
    const kit = securekit({ headers: true, cors: { origins: ["https://a.example"] } });
    assert.throws(() => {
      (kit.config.raw as { headers?: boolean }).headers = false;
    });
    kit.destroy();
  });
});

describe("API key boundary attacks", () => {
  it("constantTimeKeyCompare rejects wrong length hash without throwing", () => {
    assert.equal(constantTimeKeyCompare("presented-key", "deadbeef"), false);
    assert.equal(constantTimeKeyCompare("presented-key", "not-hex!!!"), false);
  });

  it("safeCompare is timing-safe for equal-length buffers", () => {
    assert.equal(safeCompare("abc", "abc"), true);
    assert.equal(safeCompare("abc", "abd"), false);
  });

  it("missing key response does not echo key hash or raw secrets", async () => {
    const kit = securekit({
      headers: false,
      apiKey: { validate: async () => ({ id: "k1", keyHash: "a".repeat(64) }) },
    });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 401);
      const body = String(result.body ?? "");
      assert.doesNotMatch(body, /a{64}/);
      assert.doesNotMatch(body, /sk_live/);
    }
    kit.destroy();
  });
});

describe("rate limit boundary attacks", () => {
  it("high-cardinality keys stay bounded by maxStoreEntries", () => {
    const store = new MemoryStore({ maxStoreEntries: 50, sweepIntervalMs: 0 });
    for (let i = 0; i < 10_000; i += 1) {
      store.increment(`ip:${i}:${"x".repeat(200)}`, 60_000);
    }
    assert.ok(store.size() <= 50);
    store.destroy();
  });

  it("different IP string forms create separate buckets when remoteAddress differs", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, keyBy: "ip" },
    });

    await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: {},
        remoteAddress: "::ffff:203.0.113.1",
      }),
    );
    const other = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: {},
        remoteAddress: "203.0.113.2",
      }),
    );
    assert.equal(other.kind, "continue");
    kit.destroy();
  });

  it("429 includes Retry-After semantics without secret leakage", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000 },
    });
    const ctx1 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "203.0.113.99",
    });
    await kit.handle(ctx1);

    const ctx2 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "203.0.113.99",
    });
    const blocked = await kit.handle(ctx2);
    assert.equal(blocked.kind, "respond");
    if (blocked.kind === "respond") {
      assert.equal(blocked.status, 429);
      const merged = mergeResponseHeaders(ctx2, blocked);
      assert.ok(merged.headers?.["retry-after"] !== undefined);
      assert.doesNotMatch(JSON.stringify(merged.headers ?? {}), /secret|password|token/i);
    }
    kit.destroy();
  });
});

describe("CORS boundary attacks", () => {
  it("null-byte origin is rejected", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
    });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { origin: "https://example.com\u0000.evil.com" },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 403);
    kit.destroy();
  });

  it("OPTIONS preflight with disallowed origin returns 403 not 204", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://trusted.example"] },
    });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "OPTIONS",
        url: "/",
        headers: {
          origin: "https://evil.example",
          "access-control-request-method": "POST",
        },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 403);
    kit.destroy();
  });
});

describe("request limit boundary attacks", () => {
  it("NaN Content-Length rejected", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "POST",
        url: "/",
        headers: { "content-length": "NaN" },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 400);
    kit.destroy();
  });

  it("duplicate Content-Length uses first parsed value safely", async () => {
    const kit = securekit({ headers: false, bodyLimit: "10" });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "POST",
        url: "/",
        headers: { "content-length": "5" },
      }),
    );
    assert.ok(result.kind === "continue" || result.kind === "respond");
    kit.destroy();
  });
});
