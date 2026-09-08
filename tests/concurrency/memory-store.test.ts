import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../../packages/core/dist/internal.js";

describe("MemoryStore concurrency", () => {
  it("handles concurrent increments without throwing and stays bounded", async () => {
    const store = new MemoryStore({ maxStoreEntries: 100, sweepIntervalMs: 0 });
    const windowMs = 60_000;
    const concurrency = 200;
    const keys = Array.from({ length: 50 }, (_, i) => `key-${i}`);

    await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        Promise.resolve().then(() => {
          store.increment(keys[i % keys.length]!, windowMs);
        }),
      ),
    );

    assert.ok(store.size() <= 100);
    store.destroy();
  });

  it("evicts oldest entry when maxStoreEntries exceeded under load", () => {
    const store = new MemoryStore({ maxStoreEntries: 5, sweepIntervalMs: 0 });
    for (let i = 0; i < 10; i += 1) {
      store.prepare(`k${i}`, 60_000);
    }
    assert.equal(store.size(), 5);
    store.destroy();
  });
});
