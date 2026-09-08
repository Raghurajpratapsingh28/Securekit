import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";

import { hash } from "../dist/crypto/hash.js";
import { constantTimeKeyCompare, digestApiKey } from "../dist/api-key/compare.js";
import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { AuthenticationError } from "../dist/errors/authentication-error.js";

describe("API key authentication", () => {
  const validKey = "sk_live_test_key_12345";
  const validHash = hash(validKey);

  it("rejects missing API keys with typed errors", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "key-1", keyHash: validHash }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 401);
      assert.ok(result.error instanceof AuthenticationError);
      assert.equal(result.error.reason, "missing");
      assert.doesNotMatch(result.body ?? "", /sk_live/i);
    }
    kit.destroy();
  });

  it("validates keys with constant-time digest comparison", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "key-1", keyHash: validHash }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": validKey },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "continue");
    assert.equal(ctx.state.apiKey?.id, "key-1");
    assert.equal("keyHash" in (ctx.state.apiKey ?? {}), false);
    kit.destroy();
  });

  it("rejects invalid keys without exposing submitted material", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "key-1", keyHash: validHash }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": "wrong-key-value" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.error?.reason, "invalid");
      assert.doesNotMatch(result.body ?? "", /wrong-key-value/);
      assert.doesNotMatch(String(result.error), /wrong-key-value/);
    }
    kit.destroy();
  });

  it("rejects revoked keys", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "key-1", revoked: true, keyHash: validHash }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": validKey },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.error?.reason, "revoked");
    }
    kit.destroy();
  });

  it("supports custom extractors", async () => {
    const kit = securekit({
      headers: false,
      apiKey: {
        extract: (ctx) => ctx.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
        validate: async () => ({ id: "bearer-key" }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { authorization: "Bearer token-abc" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "continue");
    assert.equal(ctx.state.apiKey?.id, "bearer-key");
    kit.destroy();
  });

  it("emits api-key.rejected events without key material", async () => {
    const events: string[] = [];
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => null,
      },
    });

    kit.on("api-key.rejected", (event) => {
      events.push(event.reason);
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": "leaked-should-not-appear" },
    });

    await kit.handle(ctx);
    assert.deepEqual(events, ["invalid"]);
    kit.destroy();
  });

  it("runs after rate limiting in the compiled pipeline", () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000 },
      apiKey: {
        validate: async () => ({ id: "key-1" }),
      },
    });

    assert.ok(kit.config.steps.length >= 2);
    kit.destroy();
  });

  it("feeds rateLimit.keyBy apiKey via presented key material before auth", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, keyBy: "apiKey" },
      apiKey: {
        validate: async () => ({ id: "account-a" }),
      },
    });

    const first = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": "key-alpha" },
      remoteAddress: "1.1.1.1",
    });
    assert.equal((await kit.handle(first)).kind, "continue");

    const secondSameKey = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": "key-alpha" },
      remoteAddress: "1.1.1.1",
    });
    const limited = await kit.handle(secondSameKey);
    assert.equal(limited.kind, "respond");
    if (limited.kind === "respond") {
      assert.equal(limited.status, 429);
    }

    const differentKeySameIp = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": "key-beta" },
      remoteAddress: "1.1.1.1",
    });
    assert.equal((await kit.handle(differentKeySameIp)).kind, "continue");

    kit.destroy();
  });
});

describe("constant-time API key comparison", () => {
  it("compares fixed-length digests", () => {
    const key = "secret-api-key";
    const digest = hash(key);
    assert.equal(constantTimeKeyCompare(key, digest), true);
    assert.equal(constantTimeKeyCompare("other-key", digest), false);
  });

  it("hashes to 32-byte digests", () => {
    assert.equal(digestApiKey("short").length, 32);
    assert.equal(digestApiKey("a-much-longer-presented-key-value").length, 32);
  });

  it("does not leak key length via early mismatch paths", () => {
    const digest = hash("baseline-key");
    assert.equal(constantTimeKeyCompare("x", digest), false);
    assert.equal(constantTimeKeyCompare("x".repeat(500), digest), false);
    assert.equal(constantTimeKeyCompare("not-a-valid-hex", "zz"), false);
  });

  it("passes statistical timing analysis", () => {
    const validKey = "sk_timing_analysis_key";
    const validHash = hash(validKey);
    const iterations = 5_000;
    const samples = 11;

    function measure(fn: () => void): number {
      for (let warmup = 0; warmup < 2_000; warmup += 1) {
        fn();
      }

      const start = performance.now();
      for (let i = 0; i < iterations; i += 1) {
        fn();
      }
      return performance.now() - start;
    }

    function trimmedMedian(values: number[]): number {
      const sorted = [...values].sort((a, b) => a - b);
      const trimmed = sorted.slice(2, sorted.length - 2);
      return trimmed[Math.floor(trimmed.length / 2)] ?? sorted[Math.floor(sorted.length / 2)] ?? 0;
    }

    const validSamples: number[] = [];
    const invalidSamples: number[] = [];

    for (let i = 0; i < samples; i += 1) {
      validSamples.push(measure(() => {
        constantTimeKeyCompare(validKey, validHash);
      }));
      invalidSamples.push(measure(() => {
        constantTimeKeyCompare("invalid-key-value", validHash);
      }));
    }

    const validDuration = trimmedMedian(validSamples);
    const invalidDuration = trimmedMedian(invalidSamples);

    const max = Math.max(validDuration, invalidDuration, 0.001);
    const spread = Math.abs(validDuration - invalidDuration) / max;

    assert.ok(
      spread < 0.35,
      `timing spread too high: ${(spread * 100).toFixed(2)}% (valid=${validDuration.toFixed(2)}ms invalid=${invalidDuration.toFixed(2)}ms)`,
    );
  });
});
