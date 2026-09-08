import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";

describe("observability hooks (PRD §31)", () => {
  it("does not invoke listeners when none are registered", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://allowed.example"] },
      rateLimit: { limit: 1, window: 60_000 },
      bodyLimit: "10b",
      apiKey: {
        validate: async () => ({ id: "k1" }),
      },
    });

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {
        origin: "https://blocked.example",
        "content-length": "999",
      },
    });

    await kit.handle(ctx);
    kit.destroy();
  });

  it("emits rate-limit.rejected with bucket metadata, not raw API keys", async () => {
    const events: Array<{ key: string; limit: number; retryAfterMs: number }> = [];
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, keyBy: "ip" },
    });
    kit.on("rate-limit.rejected", (evt) => events.push(evt));

    const ctx1 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "203.0.113.10",
    });
    const ctx2 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "203.0.113.10",
    });

    await kit.handle(ctx1);
    const rejected = await kit.handle(ctx2);
    assert.equal(rejected.kind, "respond");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.key, "203.0.113.10");
    assert.equal(events[0]?.limit, 1);
    assert.ok((events[0]?.retryAfterMs ?? 0) > 0);
    kit.destroy();
  });

  it("emits cors.rejected for disallowed origins", async () => {
    const origins: Array<string | undefined> = [];
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://allowed.example"] },
    });
    kit.on("cors.rejected", (evt) => origins.push(evt.origin));

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://evil.example" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    assert.deepEqual(origins, ["https://evil.example"]);
    kit.destroy();
  });

  it("emits request-limit.rejected for oversized Content-Length", async () => {
    const limits: Array<{ limitType: string; limitBytes: number; actualBytes?: number }> = [];
    const kit = securekit({
      headers: false,
      bodyLimit: "100b",
    });
    kit.on("request-limit.rejected", (evt) => limits.push(evt));

    const ctx = createSecureKitContextFromHeaders({
      method: "POST",
      url: "/",
      headers: { "content-length": "500" },
    });

    const result = await kit.handle(ctx);
    assert.equal(result.kind, "respond");
    assert.equal(limits.length, 1);
    assert.equal(limits[0]?.limitType, "body");
    assert.equal(limits[0]?.actualBytes, 500);
    kit.destroy();
  });

  it("emits api-key.rejected without embedding submitted key material", async () => {
    const reasons: string[] = [];
    const kit = securekit({
      headers: false,
      apiKey: {
        validate: async () => ({ id: "k1" }),
      },
    });
    kit.on("api-key.rejected", (evt) => reasons.push(evt.reason));

    const ctx = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
    });

    await kit.handle(ctx);
    assert.deepEqual(reasons, ["missing"]);
    kit.destroy();
  });
});
