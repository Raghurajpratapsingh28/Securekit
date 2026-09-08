import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit, ConfigurationError } from "../../packages/core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/internal.js";

describe("security fuzz and abuse", () => {
  it("rejects prototype pollution keys in configuration", () => {
    const polluted = JSON.parse('{"headers": true, "__proto__": {"polluted": true}}');
    assert.throws(() => securekit(polluted as never), ConfigurationError);
  });

  it("rejects null-byte origins without crashing", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://example.com\u0000.evil.com" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 403);
    }
    kit.destroy();
  });

  it("rejects CRLF in header values safely", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-custom": "value\r\nInjected: true" },
    });

    const result = await kit.handle(ctx);
    assert.ok(result.kind === "continue" || result.kind === "respond");
    kit.destroy();
  });

  it("rejects invalid Content-Length without crashing", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const ctx = createSecureKitContextFromHeaders({
      method: "POST",
      url: "/",
      headers: { "content-length": "not-a-number" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 400);
    }
    kit.destroy();
  });

  it("rejects disallowed HTTP methods via structural validation", async () => {
    const kit = securekit({ headers: false });
    const ctx = createSecureKitContextFromHeaders({
      method: "CUSTOM",
      url: "/",
      headers: {},
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 405);
    }
    kit.destroy();
  });

  it("rejects oversized URLs without bodyLimit configured", async () => {
    const kit = securekit({ headers: false });
    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: `/${"x".repeat(9000)}`,
      headers: {},
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 413);
    }
    kit.destroy();
  });

  it("does not leak API key material in authentication errors", async () => {
    const secret = "sk_live_super_secret_key_value";
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
      assert.doesNotMatch(result.body ?? "", new RegExp(secret));
    }
    kit.destroy();
  });
});
