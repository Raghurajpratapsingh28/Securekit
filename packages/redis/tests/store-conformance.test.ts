import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../../core/dist/rate-limit/memory-store.js";
import {
  evaluateSlidingWindowCounter,
  normalizeSlidingWindowRecord,
} from "../../core/dist/internal.js";
import { RedisStore } from "../dist/redis-store.js";
import type { RedisHashClient } from "../dist/types.js";

function createMemoryHashClient(): RedisHashClient {
  const hashes = new Map<string, Record<string, string>>();
  let chain: Promise<unknown> = Promise.resolve();

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = chain.then(operation, operation);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    async hGetAll(key) {
      return serialize(async () => ({ ...(hashes.get(key) ?? {}) }));
    },
    async hSet(key, data) {
      return serialize(async () => {
        hashes.set(key, { ...data });
        return 1;
      });
    },
    async pExpire() {
      return serialize(async () => true);
    },
    async del(...keys) {
      return serialize(async () => {
        let removed = 0;
        for (const key of keys) {
          if (hashes.delete(key)) {
            removed += 1;
          }
        }
        return removed;
      });
    },
  };
}

async function runStoreConformance(
  name: string,
  createStore: () => MemoryStore | RedisStore,
) {
  describe(`${name} Store conformance`, () => {
    it("increments counts within a window", async () => {
      const store = createStore();
      const windowMs = 60_000;
      const now = Date.now();

      const first = await store.increment("client-a", windowMs);
      normalizeSlidingWindowRecord(first, now, windowMs);
      const decision = evaluateSlidingWindowCounter(first, 1, windowMs, now);
      assert.equal(decision.allowed, true);

      const second = await store.increment("client-a", windowMs);
      normalizeSlidingWindowRecord(second, now, windowMs);
      const blocked = evaluateSlidingWindowCounter(second, 1, windowMs, now);
      assert.equal(blocked.allowed, false);

      await store.reset("client-a");
    });

    it("isolates keys", async () => {
      const store = createStore();
      const windowMs = 60_000;

      await store.increment("a", windowMs);
      const b = await store.increment("b", windowMs);
      assert.equal(b.count, 1);

      await store.reset("a");
      await store.reset("b");
    });

    it("handles concurrent increments", async () => {
      const store = createStore();
      const windowMs = 60_000;

      if (name === "RedisStore") {
        for (let i = 0; i < 20; i += 1) {
          await store.increment("concurrent", windowMs);
        }
      } else {
        await Promise.all(
          Array.from({ length: 20 }, () => store.increment("concurrent", windowMs)),
        );
      }

      const record = await store.increment("concurrent", windowMs);
      assert.equal(record.count, 21);

      await store.reset("concurrent");
    });
  });
}

runStoreConformance("MemoryStore", () => new MemoryStore({ maxStoreEntries: 100 }));
runStoreConformance("RedisStore", () => new RedisStore(createMemoryHashClient()));

describe("@/redis RedisStore", () => {
  it("uses configurable key prefixes", async () => {
    const client = createMemoryHashClient();
    const store = new RedisStore(client, { prefix: "app:rl:" });

    await store.increment("user-1", 60_000);
    const raw = await client.hGetAll("app:rl:user-1");
    assert.equal(raw.count, "1");
  });

  it("reports async Store semantics to core", async () => {
    const store = new RedisStore(createMemoryHashClient());
    const result = store.increment("probe", 1_000);
    assert.ok(result instanceof Promise);
    await result;
  });
});
