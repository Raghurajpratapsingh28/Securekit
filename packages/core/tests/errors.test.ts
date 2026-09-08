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

describe("error hierarchy", () => {
  it("provides base SecureKitError metadata", () => {
    const error = new SecureKitError("base", "BASE", 500);
    assert.equal(error.name, "SecureKitError");
    assert.equal(error.code, "BASE");
    assert.equal(error.statusCode, 500);
    assert.ok(error instanceof Error);
  });

  it("ConfigurationError includes field and suggestion", () => {
    const error = new ConfigurationError("Invalid cors config", {
      field: "cors.origins",
      received: "*",
      suggestion: "Use an explicit origin list when credentials is true.",
    });

    assert.ok(error instanceof SecureKitError);
    assert.equal(error.name, "ConfigurationError");
    assert.equal(error.code, "CONFIGURATION_ERROR");
    assert.equal(error.field, "cors.origins");
    assert.match(String(error), /Invalid cors config/);
    assert.match(String(error), /field: cors\.origins/);
    assert.match(String(error), /Suggestion:/);
  });

  it("ConfigurationError redacts sensitive fields in received metadata", () => {
    const error = new ConfigurationError("Invalid api key metadata", {
      field: "apiKey.validate",
      received: { id: "", keyHash: "deadbeef", revoked: true },
    });

    assert.match(String(error), /\[redacted\]/);
    assert.doesNotMatch(String(error), /deadbeef/);
  });

  it("request-time errors carry typed metadata", () => {
    const rateLimit = new RateLimitError(1_000);
    assert.equal(rateLimit.retryAfterMs, 1_000);
    assert.equal(rateLimit.statusCode, 429);

    const cors = new CorsError("https://evil.test");
    assert.equal(cors.origin, "https://evil.test");

    const requestLimit = new RequestLimitError("body", 1_048_576);
    assert.equal(requestLimit.limitType, "body");
    assert.equal(requestLimit.limitBytes, 1_048_576);

    const auth = new AuthenticationError("invalid");
    assert.equal(auth.reason, "invalid");
    assert.equal(auth.statusCode, 401);
  });

  it("uses generic messages that never embed submitted key material", () => {
    const secret = "sk_live_super_secret_api_key_12345";

    const missing = new AuthenticationError("missing");
    const invalid = new AuthenticationError("invalid");
    const revoked = new AuthenticationError("revoked");

    for (const error of [missing, invalid, revoked]) {
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(JSON.stringify(error), new RegExp(secret));
      assert.equal("key" in error, false);
      assert.equal("token" in error, false);
    }
  });
});
