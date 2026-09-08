import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";
import type { RateLimitRecord, Store } from "../dist/types/store.js";
import { normalizeSlidingWindowRecord, evaluateSlidingWindowCounter, isAsyncStore } from "../dist/internal.js";

class AsyncMockStore implements Store {
  private readonly records = new Map<string, RateLimitRecord>();

  async increment(key: string, windowMs: number): Promise<RateLimitRecord> {
    const now = Date.now();
    let record = this.records.get(key);
    if (record === undefined) {
      record = { count: 0, windowStart: now, prevCount: 0 };
      this.records.set(key, record);
    }

    normalizeSlidingWindowRecord(record, now, windowMs);
    record.count += 1;
    return { ...record };
  }

  async reset(key: string): Promise<void> {
    this.records.delete(key);
  }
}

describe("async Store compile-time guards", () => {
  it("rejects token-bucket with async stores", () => {
    const store = new AsyncMockStore();
    assert.throws(
      () => securekit({
          headers: false,
          rateLimit: { limit: 10, window: 60_000, algorithm: "token-bucket", store },
        }),
      ConfigurationError,
    );
  });
});

describe("async Store pipeline integration", () => {
  it("compiles an async rate-limit step when the store returns promises", async () => {
    const store = new AsyncMockStore();
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, store },
    });

    assert.equal(kit.config.rateLimit?.isAsync, true);

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "9.9.9.9",
    });

    assert.equal((await kit.handle(ctx)).kind, "continue");

    const blocked = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: {},
        remoteAddress: "9.9.9.9",
      }),
    );

    assert.equal(blocked.kind, "respond");
    if (blocked.kind === "respond") {
      assert.equal(blocked.status, 429);
    }

    kit.destroy();
  });

  it("isAsyncStore probe rejection does not cause unhandledRejection", async () => {
    const rejectingStore: Store = {
      increment: async () => {
        throw new Error("probe failed");
      },
      reset: async () => undefined,
    };

    assert.equal(isAsyncStore(rejectingStore), true);

    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, store: rejectingStore },
    });

    await assert.rejects(
      kit.handle(
        createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} }),
      ),
      /probe failed/,
    );
    kit.destroy();
  });
});
