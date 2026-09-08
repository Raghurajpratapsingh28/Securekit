import assert from "node:assert/strict";
import express from "express";
import Fastify from "fastify";
import request from "supertest";
import { describe, it } from "node:test";

import { securekit } from "../../packages/core/dist/index.js";
import { expressAdapter } from "../../packages/express/dist/index.js";
import { fastifyPlugin } from "../../packages/fastify/dist/index.js";

async function runExpressScenario(
  kit: ReturnType<typeof securekit>,
  scenario: (agent: request.SuperTest<request.Test>) => Promise<void>,
) {
  const app = express();
  app.use(expressAdapter(kit));
  app.get("/", (_req, res) => res.send("ok"));
  await scenario(request(app));
}

async function runFastifyScenario(
  kit: ReturnType<typeof securekit>,
  scenario: (app: ReturnType<typeof Fastify>) => Promise<void>,
) {
  const app = Fastify();
  await app.register(fastifyPlugin(kit));
  app.get("/", async () => "ok");
  await scenario(app);
  await app.close();
}

describe("adapter behavioral parity", () => {
  it("both adapters apply default security headers on success", async () => {
    const kitExpress = securekit();
    await runExpressScenario(kitExpress, async (agent) => {
      const res = await agent.get("/").expect(200);
      assert.equal(res.headers["x-content-type-options"], "nosniff");
    });
    kitExpress.destroy();

    const kitFastify = securekit();
    await runFastifyScenario(kitFastify, async (app) => {
      const res = await app.inject({ method: "GET", url: "/" });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["x-content-type-options"], "nosniff");
    });
    kitFastify.destroy();
  });

  it("both adapters return 429 with Retry-After and CORS on rate limit", async () => {
    const config = {
      headers: false as const,
      cors: { origins: ["https://example.com"] as const },
      rateLimit: { limit: 1, window: 60_000 },
    };

    const kitExpress = securekit(config);
    await runExpressScenario(kitExpress, async (agent) => {
      await agent.get("/").set("Origin", "https://example.com").expect(200);
      const limited = await agent.get("/").set("Origin", "https://example.com").expect(429);
      assert.ok(limited.headers["retry-after"]);
      assert.equal(limited.headers["access-control-allow-origin"], "https://example.com");
    });
    kitExpress.destroy();

    const kitFastify = securekit(config);
    await runFastifyScenario(kitFastify, async (app) => {
      await app.inject({ method: "GET", url: "/", headers: { origin: "https://example.com" } });
      const limited = await app.inject({
        method: "GET",
        url: "/",
        headers: { origin: "https://example.com" },
      });
      assert.equal(limited.statusCode, 429);
      assert.ok(limited.headers["retry-after"]);
      assert.equal(limited.headers["access-control-allow-origin"], "https://example.com");
    });
    kitFastify.destroy();
  });

  it("both adapters reject disallowed CORS origins with 403", async () => {
    const config = {
      headers: false as const,
      cors: { origins: ["https://allowed.example"] as const },
    };

    const kitExpress = securekit(config);
    await runExpressScenario(kitExpress, async (agent) => {
      await agent.get("/").set("Origin", "https://evil.example").expect(403);
    });
    kitExpress.destroy();

    const kitFastify = securekit(config);
    await runFastifyScenario(kitFastify, async (app) => {
      const res = await app.inject({
        method: "GET",
        url: "/",
        headers: { origin: "https://evil.example" },
      });
      assert.equal(res.statusCode, 403);
    });
    kitFastify.destroy();
  });
});
