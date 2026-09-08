import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { describe, it } from "node:test";

import { securekit } from "../../core/dist/index.js";
import { expressAdapter } from "../dist/index.js";

describe("@/express adapter", () => {
  it("applies default security headers and continues to the route", async () => {
    const app = express();
    const kit = securekit();
    app.use(expressAdapter(kit));
    app.get("/", (_req, res) => {
      res.send("ok");
    });

    const response = await request(app).get("/").expect(200);
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.text, "ok");
    kit.destroy();
  });

  it("short-circuits preflight requests without reaching the route", async () => {
    const app = express();
    const kit = securekit({
      headers: false,
      cors: {
        origins: ["https://example.com"],
        methods: ["GET"],
      },
    });
    let routeCalled = false;
    app.use(expressAdapter(kit));
    app.get("/", (_req, res) => {
      routeCalled = true;
      res.send("nope");
    });

    await request(app)
      .options("/")
      .set("Origin", "https://example.com")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);

    assert.equal(routeCalled, false);
    kit.destroy();
  });

  it("returns 429 with Retry-After and exposes req. on success", async () => {
    const app = express();
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
      rateLimit: { limit: 1, window: 60_000 },
      requestId: true,
    });

    app.use(expressAdapter(kit));
    app.get("/", (req, res) => {
      assert.ok((req as import("../dist/index.js").SecureKitExpressRequest).securekit?.requestId);
      res.send("ok");
    });

    await request(app)
      .get("/")
      .set("Origin", "https://example.com")
      .expect(200);

    const limited = await request(app)
      .get("/")
      .set("Origin", "https://example.com")
      .expect(429);

    assert.ok(limited.headers["retry-after"]);
    assert.equal(limited.headers["access-control-allow-origin"], "https://example.com");
    kit.destroy();
  });
});
