import assert from "node:assert/strict";
import Fastify from "fastify";
import { describe, it } from "node:test";

import { securekit } from "../../core/dist/index.js";
import { fastifyPlugin } from "../dist/index.js";

describe("@/fastify adapter", () => {
  it("applies default security headers and continues to the route", async () => {
    const kit = securekit();
    const app = Fastify();
    await app.register(fastifyPlugin(kit));
    app.get("/", async () => "ok");

    const response = await app.inject({ method: "GET", url: "/" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.body, "ok");
    await app.close();
    kit.destroy();
  });

  it("short-circuits preflight requests without reaching the route", async () => {
    const kit = securekit({
      headers: false,
      cors: {
        origins: ["https://example.com"],
        methods: ["GET"],
      },
    });
    const app = Fastify();
    await app.register(fastifyPlugin(kit));
    app.get("/", async () => "nope");

    const response = await app.inject({
      method: "OPTIONS",
      url: "/",
      headers: {
        origin: "https://example.com",
        "access-control-request-method": "GET",
      },
    });

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "https://example.com");
    await app.close();
    kit.destroy();
  });

  it("returns 429 with Retry-After and exposes request. on success", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
      rateLimit: { limit: 1, window: 60_000 },
      requestId: true,
    });
    const app = Fastify();
    await app.register(fastifyPlugin(kit));
    app.get("/", async (request) => {
      assert.ok((request as import("../dist/index.js").SecureKitFastifyRequest).securekit?.requestId);
      return "ok";
    });

    const first = await app.inject({
      method: "GET",
      url: "/",
      headers: { origin: "https://example.com" },
    });
    assert.equal(first.statusCode, 200);

    const second = await app.inject({
      method: "GET",
      url: "/",
      headers: { origin: "https://example.com" },
    });
    assert.equal(second.statusCode, 429);
    assert.ok(second.headers["retry-after"]);
    assert.equal(second.headers["access-control-allow-origin"], "https://example.com");

    await app.close();
    kit.destroy();
  });
});
