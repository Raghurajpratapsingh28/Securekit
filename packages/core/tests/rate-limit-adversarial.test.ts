import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../dist/rate-limit/memory-store.js";
import { normalizeSlidingWindowRecord } from "../dist/rate-limit/sliding-window.js";
import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { mergeResponseHeaders } from "../dist/internal/merge-response-headers.js";
import { RateLimitError } from "../dist/errors/rate-limit-error.js";

describe("rate limiting adversarial review", () => {
  it("LRU evicts oldest entry when maxStoreEntries is exceeded", () => {
    const store = new MemoryStore({ maxStoreEntries: 2, sweepIntervalMs: 0 });
    store.increment("first", 60_000);
    store.increment("second", 60_000);
    store.increment("third", 60_000);
    assert.equal(store.size(), 2);
    store.destroy();
  });

  it("reset() removes a bucket", () => {
    const store = new MemoryStore({ maxStoreEntries: 10, sweepIntervalMs: 0 });
    store.increment("k", 60_000);
    assert.equal(store.size(), 1);
    store.reset("k");
    assert.equal(store.size(), 0);
    store.destroy();
  });

  it("sliding window resets at boundary", () => {
    const record = { count: 0, windowStart: 0, prevCount: 0 };
    const windowMs = 1_000;
    normalizeSlidingWindowRecord(record, 1_500, windowMs);
    assert.equal(record.windowStart, 1_500);
    assert.equal(record.prevCount, 0);
  });

  it("includes Retry-After on rejection", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000 },
    });

    const ctx1 = createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} });
    await kit.handle(ctx1);

    const ctx2 = createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} });
    const result = await kit.handle(ctx2);
    const merged = mergeResponseHeaders(ctx2, result);

    assert.equal(merged.kind, "respond");
    if (merged.kind === "respond") {
      assert.equal(merged.status, 429);
      assert.ok(merged.error instanceof RateLimitError);
      assert.ok(merged.headers?.["retry-after"]);
    }
    kit.destroy();
  });

  it("ip+apiKey falls back to ip-only before API key validation", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, keyBy: "ip+apiKey" },
      apiKey: {
        validate: async () => ({ id: "tenant" }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "198.51.100.4",
    });

    await kit.handle(ctx);
    const second = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: {},
        remoteAddress: "198.51.100.4",
      }),
    );

    assert.equal(second.kind, "respond");
    if (second.kind === "respond") {
      assert.equal(second.status, 429);
    }
    kit.destroy();
  });
});
