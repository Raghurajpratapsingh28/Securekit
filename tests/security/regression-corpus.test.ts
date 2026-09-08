/**
 * Security regression corpus — one test per fixed vulnerability class.
 * Each case documents WHY the behavior is security-critical.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../../packages/core/dist/kit.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/context/create-context.js";
import { ConfigurationError } from "../../packages/core/dist/errors/configuration-error.js";

describe("SEC-001: preflight must not bypass rate limiting", () => {
  it("applies rate limit before CORS preflight short-circuit", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"], methods: ["GET"] },
      rateLimit: { limit: 1, window: 60_000 },
    });

    const preflight = createSecureKitContextFromHeaders({
      method: "OPTIONS",
      url: "/",
      headers: {
        origin: "https://example.com",
        "access-control-request-method": "GET",
      },
    });

    await kit.handle(preflight);
    const second = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "OPTIONS",
        url: "/",
        headers: {
          origin: "https://example.com",
          "access-control-request-method": "GET",
        },
      }),
    );

    assert.equal(second.kind, "respond");
    if (second.kind === "respond") {
      assert.equal(second.status, 429);
    }
    kit.destroy();
  });
});

describe("SEC-002: prototype pollution in config", () => {
  it("rejects __proto__ keys at compile time", () => {
    const bad = JSON.parse('{"headers": true, "__proto__": {"admin": true}}');
    assert.throws(() => securekit(bad), ConfigurationError);
  });
});

describe("SEC-003: API key material must not appear in errors", () => {
  it("401 responses omit submitted key strings", async () => {
    const secret = "sk_live_leaked_material_test";
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => null,
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": secret },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.doesNotMatch(String(result.body ?? ""), new RegExp(secret));
    }
    kit.destroy();
  });
});

describe("SEC-004: rate-limit keyBy apiKey uses digest not raw key", () => {
  it("stores hashed key material for rate-limit bucketing", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 100, window: 60_000, keyBy: "apiKey" },
      apiKey: {
        validate: async (key) => ({ id: "tenant", keyHash: "unused" }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-api-key": "raw-key-should-not-be-stored" },
    });

    await kit.handle(ctx);
    assert.ok(typeof ctx.state.rateLimitKeyMaterial === "string");
    assert.notEqual(ctx.state.rateLimitKeyMaterial, "raw-key-should-not-be-stored");
    kit.destroy();
  });
});

describe("SEC-005: token-bucket rejected with async Redis at compile time", () => {
  it("throws ConfigurationError instead of runtime failure", () => {
    const asyncStore = {
      increment: async () => ({ count: 1, windowStart: Date.now(), prevCount: 0 }),
      reset: async () => undefined,
    };

    assert.throws(
      () => securekit({
          headers: false,
          rateLimit: {
            limit: 10,
            window: 60_000,
            algorithm: "token-bucket",
            store: asyncStore,
          },
        }),
      ConfigurationError,
    );
  });
});
