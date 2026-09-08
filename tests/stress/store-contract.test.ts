/**
 * Store contract stress tests — MemoryStore vs RedisStore semantic equivalence.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../../packages/core/dist/rate-limit/memory-store.js";
import {
  evaluateSlidingWindowCounter,
  normalizeSlidingWindowRecord,
} from "../../packages/core/dist/internal.js";
import { RedisStore } from "../../packages/redis/dist/redis-store.js";

function createMemoryHashClient() {
  const hashes = new Map();
  let chain = Promise.resolve();
  const serialize = (op) => {
    const next = chain.then(op, op);
    chain = next.then(() => undefined, () => undefined);
    return next;
  };
  return {
    hGetAll: (key) => serialize(async () => ({ ...(hashes.get(key) ?? {}) })),
    hSet: (key, data) => serialize(async () => { hashes.set(key, { ...data }); return 1; }),
    pExpire: () => serialize(async () => true),
    del: (...keys) =>
      serialize(async () => {
        let n = 0;
        for (const k of keys) if (hashes.delete(k)) n += 1;
        return n;
      }),
  };
}

async function assertBlockedAfterLimit(store, limit = 2) {
  const windowMs = 60_000;
  const now = Date.now();
  for (let i = 0; i < limit; i += 1) {
    const record = await store.increment("k", windowMs);
    normalizeSlidingWindowRecord(record, now, windowMs);
  }
  const final = await store.increment("k", windowMs);
  normalizeSlidingWindowRecord(final, now, windowMs);
  const decision = evaluateSlidingWindowCounter(final, limit, windowMs, now);
  assert.equal(decision.allowed, false);
  assert.ok(decision.retryAfterMs >= 0);
  await store.reset("k");
}

describe("Store contract hardening", () => {
  it("MemoryStore: increment/reset/expiration semantics", async () => {
    const store = new MemoryStore({ maxStoreEntries: 10, sweepIntervalMs: 0 });
    await assertBlockedAfterLimit(store);
    store.destroy();
  });

  it("RedisStore: increment/reset/expiration semantics", async () => {
    const store = new RedisStore(createMemoryHashClient());
    await assertBlockedAfterLimit(store);
    await store.destroy();
  });

  it("MemoryStore reset clears bucket for reuse", () => {
    const store = new MemoryStore({ maxStoreEntries: 10, sweepIntervalMs: 0 });
    store.increment("reuse", 60_000);
    store.increment("reuse", 60_000);
    store.reset("reuse");
    const record = store.increment("reuse", 60_000);
    assert.equal(record.count, 1);
    store.destroy();
  });

  it("RedisStore failure: increment rejects propagate", async () => {
    const store = new RedisStore({
      hGetAll: async () => {
        throw new Error("redis unavailable");
      },
      hSet: async () => 1,
      pExpire: async () => true,
      del: async () => 1,
    });

    await assert.rejects(() => store.increment("k", 1000), /redis unavailable/);
    await store.destroy();
  });
});
