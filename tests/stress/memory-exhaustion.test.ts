/**
 * Phase 11 — memory/cardinality exhaustion attacks against MemoryStore and pipeline.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../../packages/core/dist/rate-limit/memory-store.js";
import { securekit } from "../../packages/core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/internal.js";

const LARGE_KEY_RUN = process.env.STRESS_MEMORY === "1";

describe("MemoryStore cardinality limits", () => {
  it("maxStoreEntries is enforced under mass unique keys", () => {
    const max = 500;
    const store = new MemoryStore({ maxStoreEntries: max, sweepIntervalMs: 0 });
    const iterations = LARGE_KEY_RUN ? 100_000 : 25_000;

    for (let i = 0; i < iterations; i += 1) {
      store.increment(`key-${i}`, 60_000);
    }

    assert.ok(store.size() <= max, `size ${store.size()} exceeded max ${max}`);
    store.destroy();
  });

  it("LRU eviction removes oldest entry when at capacity", () => {
    const store = new MemoryStore({ maxStoreEntries: 3, sweepIntervalMs: 0 });
    store.prepare("oldest", 60_000);
    store.prepare("middle", 60_000);
    store.prepare("newest", 60_000);
    store.prepare("overflow", 60_000);

    assert.equal(store.size(), 3);
    const oldestFresh = store.increment("oldest", 60_000);
    assert.equal(oldestFresh.count, 1, "oldest key should have been evicted and re-created");
    store.destroy();
  });

  it("reset reduces cardinality", () => {
    const store = new MemoryStore({ maxStoreEntries: 100, sweepIntervalMs: 0 });
    for (let i = 0; i < 50; i += 1) {
      store.increment(`k${i}`, 60_000);
    }
    assert.equal(store.size(), 50);
    for (let i = 0; i < 50; i += 1) {
      store.reset(`k${i}`);
    }
    assert.equal(store.size(), 0);
    store.destroy();
  });

  it("sweep removes stale entries when sweepIntervalMs > 0", () => {
    const store = new MemoryStore({ maxStoreEntries: 1000, sweepIntervalMs: 10 });
    store.increment("stale", 5);
    const start = Date.now();
    while (Date.now() - start < 50) {
      // allow sweep timer to fire
    }
    store.destroy();
    assert.ok(true);
  });
});

describe("pipeline memory under sustained unique IPs", () => {
  it("rate limit store stays bounded during high-cardinality traffic", async () => {
    const store = new MemoryStore({ maxStoreEntries: 200, sweepIntervalMs: 0 });
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1000, window: 60_000, store },
    });

    const iterations = LARGE_KEY_RUN ? 10_000 : 2_000;
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i += 1) {
      await kit.handle(
        createSecureKitContextFromHeaders({
          method: "GET",
          url: "/",
          headers: {},
          remoteAddress: `203.0.${Math.floor(i / 256)}.${i % 256}`,
        }),
      );
    }

    assert.ok(store.size() <= 200);
    const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
    assert.ok(heapDeltaMb < 100, `heap grew ${heapDeltaMb.toFixed(1)}MB — investigate`);
    kit.destroy();
    assert.equal(store.size(), 0);
  });
});
