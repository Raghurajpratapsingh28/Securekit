/**
 * Phase 11 — controlled chaos / failure injection across SecureKit.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit, ConfigurationError } from "../../packages/core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/internal.js";
import { RedisStore } from "../../packages/redis/dist/index.js";

describe("chaos — store failures", () => {
  it("Redis timeout during increment rejects without crashing", async () => {
    const store = new RedisStore({
      hGetAll: () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 5)),
      hSet: async () => 1,
      pExpire: async () => true,
      del: async () => 1,
    });

    await assert.rejects(() => store.increment("k", 1000), /TIMEOUT/);
    await store.destroy();
  });

  it("async store failure during pipeline propagates to caller", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: {
        limit: 10,
        window: 60_000,
        store: {
          increment: async () => {
            throw new Error("store exploded");
          },
          reset: async () => undefined,
        },
      },
    });

    await assert.rejects(
      kit.handle(
        createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} }),
      ),
      /store exploded/,
    );
    kit.destroy();
  });
});

describe("chaos — lifecycle", () => {
  it("repeated  init/destroy does not throw", () => {
    for (let i = 0; i < 100; i += 1) {
      const kit = securekit({
        headers: true,
        cors: { origins: ["https://example.com"] },
        rateLimit: { limit: 100, window: 60_000 },
      });
      kit.destroy();
    }
  });

  it("double destroy is safe", () => {
    const kit = securekit({ headers: false });
    kit.destroy();
    kit.destroy();
  });
});

describe("chaos — invalid configuration", () => {
  it("rejects null config", () => {
    assert.throws(() => securekit(null as never), ConfigurationError);
  });

  it("rejects config with prototype pollution keys", () => {
    const polluted = JSON.parse('{"headers": true, "__proto__": {"polluted": true}}');
    assert.throws(() => securekit(polluted as never), ConfigurationError);
  });

  it("rejects unknown top-level keys", () => {
    assert.throws(
      () => securekit({ headers: true, secretBackdoor: true } as never),
      ConfigurationError,
    );
  });
});

describe("chaos — malformed requests", () => {
  it("handles empty method and oversized URL without throwing", async () => {
    const kit = securekit({ headers: false });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "",
        url: `/${"a".repeat(20_000)}`,
        headers: {},
      }),
    );
    assert.equal(result.kind, "respond");
    kit.destroy();
  });

  it("handles conflicting content-length values via first valid parse path", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "POST",
        url: "/",
        headers: { "content-length": "99999999999999999999" },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.ok(result.status === 400 || result.status === 413);
    kit.destroy();
  });
});

describe("chaos — API key edge cases", () => {
  it("revoked key returns 401 without leaking key material in body", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "k1", revoked: true }),
      },
    });
    const secret = "sk_live_super_secret_key";
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { "x-api-key": secret },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 401);
      assert.doesNotMatch(String(result.body ?? ""), /sk_live/);
    }
    kit.destroy();
  });

  it("validate throw does not leave kit in corrupted state", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => {
          throw new Error("auth backend down");
        },
      },
    });

    await assert.rejects(
      () =>
        kit.handle(
          createSecureKitContextFromHeaders({
            method: "GET",
            url: "/",
            headers: { "x-api-key": "k" },
          }),
        ),
      /auth backend down/,
    );

    await assert.rejects(
      () =>
        kit.handle(
          createSecureKitContextFromHeaders({
            method: "GET",
            url: "/",
            headers: { "x-api-key": "k" },
          }),
        ),
      /auth backend down/,
    );
    kit.destroy();
  });
});

describe("chaos — concurrent pipeline", () => {
  it("parallel handle calls remain deterministic under rate limit", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 5, window: 60_000 },
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        kit.handle(
          createSecureKitContextFromHeaders({
            method: "GET",
            url: "/",
            headers: {},
            remoteAddress: "198.51.100.1",
          }),
        ),
      ),
    );

    const blocked = results.filter((r) => r.kind === "respond" && r.status === 429);
    assert.ok(blocked.length >= 15);
    kit.destroy();
  });
});
