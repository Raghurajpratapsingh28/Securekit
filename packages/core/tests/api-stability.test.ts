import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthenticationError,
  ConfigurationError,
  CorsError,
  RateLimitError,
  RequestLimitError,
  SecureKitError,
} from "../dist/errors/index.js";

describe("API stability — error classes", () => {
  it("SecureKitError base preserves name, code, statusCode", () => {
    const error = new SecureKitError("test", "TEST_CODE", 500);
    assert.equal(error.name, "SecureKitError");
    assert.equal(error.code, "TEST_CODE");
    assert.equal(error.statusCode, 500);
    assert.ok(error instanceof Error);
  });

  it("AuthenticationError exposes stable reason enum", () => {
    for (const reason of ["missing", "invalid", "revoked"] as const) {
      const error = new AuthenticationError(reason);
      assert.equal(error.reason, reason);
      assert.equal(error.statusCode, 401);
      assert.equal(error.code, "AUTHENTICATION_FAILED");
    }
  });

  it("RateLimitError exposes retryAfterMs", () => {
    const error = new RateLimitError(5000);
    assert.equal(error.retryAfterMs, 5000);
    assert.equal(error.statusCode, 429);
  });

  it("RequestLimitError exposes limitType and limitBytes", () => {
    const error = new RequestLimitError("body", 1024);
    assert.equal(error.limitType, "body");
    assert.equal(error.limitBytes, 1024);
    assert.equal(error.statusCode, 413);
  });

  it("CorsError does not embed raw origin in message by default", () => {
    const origin = "https://evil.example";
    const error = new CorsError(origin);
    assert.equal(error.origin, origin);
    assert.doesNotMatch(error.message, /evil/);
  });

  it("ConfigurationError redacts sensitive received fields in message", () => {
    const error = new ConfigurationError("bad api key config", {
      field: "apiKey.validate",
      received: { secret: "sk_live_test", token: "abc" },
    });
    assert.doesNotMatch(error.message, /sk_live_test/);
    assert.match(error.message, /\[redacted\]/);
  });
});
