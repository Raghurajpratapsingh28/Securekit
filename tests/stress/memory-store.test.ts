import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../../packages/core/dist/internal.js";

describe("MemoryStore sustained load", () => {
  it("bounds entries at maxStoreEntries under high-cardinality keys", () => {
    const store = new MemoryStore({ maxStoreEntries: 100, sweepIntervalMs: 0 });
    const windowMs = 60_000;

    for (let i = 0; i < 10_000; i += 1) {
      store.increment(`key-${i}`, windowMs);
    }

    assert.ok(store.size() <= 100);
    store.destroy();
  });

  it("destroy clears records and stops sweep timer", () => {
    const store = new MemoryStore({ maxStoreEntries: 50, sweepIntervalMs: 50 });
    store.increment("a", 1_000);
    store.increment("b", 1_000);
    assert.equal(store.size(), 2);
    store.destroy();
    assert.equal(store.size(), 0);
  });
});
