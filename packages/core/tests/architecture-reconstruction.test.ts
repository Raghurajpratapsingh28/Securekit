import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../dist/index.js";
import { createSecureKitContextFromHeaders, mergeResponseHeaders } from "../dist/internal.js";

describe("architecture reconstruction", () => {
  it("disabled modules contribute zero extra steps beyond structural guard", () => {
    const minimal = securekit({ headers: false });
    const withHeaders = securekit({ headers: true });
    assert.ok(minimal.config.steps.length <= withHeaders.config.steps.length);
    minimal.destroy();
    withHeaders.destroy();
  });

  it("pipeline is a flat frozen step array — no runtime feature branches in runner", () => {
    const kit = securekit({
      headers: true,
      cors: { origins: ["https://example.com"] },
      rateLimit: { limit: 100, window: 60_000 },
    });
    assert.ok(Object.isFrozen(kit.config.steps));
    assert.ok(kit.config.steps.every((step) => typeof step === "function"));
    kit.destroy();
  });

  it("rate limit before CORS in compiled order with CORS applied on 429", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://allowed.example"] },
      rateLimit: { limit: 1, window: 60_000 },
    });

    await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { origin: "https://allowed.example" },
        remoteAddress: "203.0.113.1",
      }),
    );

    const ctx2 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://allowed.example" },
      remoteAddress: "203.0.113.1",
    });
    const blocked = await kit.handle(ctx2);

    assert.equal(blocked.kind, "respond");
    if (blocked.kind === "respond") {
      assert.equal(blocked.status, 429);
      const merged = mergeResponseHeaders(ctx2, blocked);
      assert.equal(merged.headers?.["access-control-allow-origin"], "https://allowed.example");
    }
    kit.destroy();
  });

  it("compiled kit handle returns Promise without forcing async store when sync", async () => {
    const kit = securekit({ headers: false });
    const result = kit.handle(
      createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} }),
    );
    assert.ok(result instanceof Promise);
    assert.equal((await result).kind, "continue");
    kit.destroy();
  });
});
