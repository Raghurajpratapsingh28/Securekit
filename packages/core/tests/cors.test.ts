import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileCors } from "../dist/cors/compile.js";
import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { readResponseHeaders } from "../dist/context/read-response-headers.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";
import { CorsError } from "../dist/errors/cors-error.js";

describe("CORS module", () => {
  it("rejects wildcard origins with credentials at compile time", () => {
    assert.throws(
      () =>
        compileCors({
          cors: { origins: "*", credentials: true },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigurationError);
        assert.match(String(error), /cannot be combined with cors.credentials: true/);
        return true;
      },
    );
  });

  it("allows static origins via Set lookup", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"], credentials: true },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/resource",
      headers: { origin: "https://example.com" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "continue");
    assert.equal(
      readResponseHeaders(ctx.responseHeaders)["access-control-allow-origin"],
      "https://example.com",
    );
  });

  it("rejects disallowed origins", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/resource",
      headers: { origin: "https://evil.test" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 403);
      assert.ok(result.error instanceof CorsError);
    }
  });

  it("does not match null origin unless allowNullOrigin is true", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["null"] },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/resource",
      headers: { origin: "null" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
  });

  it("handles preflight without reaching later steps", async () => {
    let downstreamCalled = false;
    const kit = securekit({
      headers: false,
      cors: {
        origins: ["https://example.com"],
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        maxAge: 600,
      },
      plugins: [
        {
          name: "downstream-spy",
          compile(steps) {
            steps.push(() => {
              downstreamCalled = true;
              return { kind: "continue" as const };
            });
          },
        },
      ],
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "OPTIONS",
      url: "/resource",
      headers: {
        origin: "https://example.com",
        "access-control-request-method": "POST",
      },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.equal(result.status, 204);
    }
    assert.equal(downstreamCalled, false);

    const headers = readResponseHeaders(ctx.responseHeaders);
    assert.equal(headers["access-control-allow-origin"], "https://example.com");
    assert.match(headers["access-control-allow-methods"] ?? "", /POST/);
    assert.equal(headers["access-control-max-age"], "600");
  });

  it("applies rate limiting to preflight requests", async () => {
    const kit = securekit({
      headers: false,
      cors: {
        origins: ["https://example.com"],
        methods: ["GET", "POST"],
      },
      rateLimit: { limit: 1, window: 60_000 },
    });

    const preflight = () =>
      createSecureKitContextFromHeaders({
        method: "OPTIONS",
        url: "/resource",
        headers: {
          origin: "https://example.com",
          "access-control-request-method": "POST",
        },
        remoteAddress: "5.6.7.8",
      });

    assert.equal((await kit.handle(preflight())).kind, "respond");

    const limited = await kit.handle(preflight());
    assert.equal(limited.kind, "respond");
    if (limited.kind === "respond") {
      assert.equal(limited.status, 429);
    }

    kit.destroy();
  });

  it("supports dynamic origin callbacks", async () => {
    const kit = securekit({
      headers: false,
      cors: {
        origins: (origin) => origin.endsWith(".example.com"),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://app.example.com" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "continue");
  });
});
