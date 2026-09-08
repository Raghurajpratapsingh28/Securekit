/**
 * Phase 11 — concurrency and race stress for stateful components.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../../packages/core/dist/internal.js";
import { securekit } from "../../packages/core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/internal.js";

describe("MemoryStore concurrent races", () => {
  it("concurrent increment+reset on same key does not throw", async () => {
    const store = new MemoryStore({ maxStoreEntries: 100, sweepIntervalMs: 0 });
    const key = "race-key";
    const windowMs = 60_000;

    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => {
          if (i % 3 === 0) {
            store.reset(key);
          } else {
            store.increment(key, windowMs);
          }
        }),
      ),
    );

    assert.ok(store.size() <= 100);
    store.destroy();
  });

  it("expiry boundary under concurrent access remains stable", async () => {
    const store = new MemoryStore({ maxStoreEntries: 10, sweepIntervalMs: 0 });
    const windowMs = 20;

    for (let round = 0; round < 5; round += 1) {
      await Promise.all(
        Array.from({ length: 50 }, () =>
          Promise.resolve().then(() => store.increment("boundary", windowMs)),
        ),
      );
      await new Promise((r) => setTimeout(r, windowMs + 5));
    }

    store.destroy();
  });
});

describe("pipeline concurrent adapter simulation", () => {
  it("100 parallel requests with same IP respect limit", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 10, window: 60_000 },
    });

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        kit.handle(
          createSecureKitContextFromHeaders({
            method: "GET",
            url: "/",
            headers: {},
            remoteAddress: "203.0.113.50",
          }),
        ),
      ),
    );

    const allowed = results.filter((r) => r.kind === "continue").length;
    const blocked = results.filter((r) => r.kind === "respond" && r.status === 429).length;
    assert.equal(allowed + blocked, 100);
    assert.ok(allowed <= 10);
    assert.ok(blocked >= 90);
    kit.destroy();
  });
});

describe("repeatable race detection", () => {
  for (let run = 0; run < 3; run += 1) {
    it(`MemoryStore parallel increments run ${run + 1}/3`, async () => {
      const store = new MemoryStore({ maxStoreEntries: 50, sweepIntervalMs: 0 });
      const keys = Array.from({ length: 20 }, (_, i) => `k${i}`);

      await Promise.all(
        Array.from({ length: 200 }, (_, i) =>
          Promise.resolve().then(() => store.increment(keys[i % keys.length]!, 60_000)),
        ),
      );

      assert.ok(store.size() <= 50);
      store.destroy();
    });
  }
});
