/**
 * Advanced security regression suite — realistic attack patterns beyond happy-path fuzz.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit, ConfigurationError } from "../../packages/core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/internal.js";
import { MemoryStore } from "../../packages/core/dist/rate-limit/memory-store.js";

describe("malformed HTTP and header abuse", () => {
  it("rejects negative Content-Length", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "POST",
        url: "/",
        headers: { "content-length": "-1" },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 400);
    kit.destroy();
  });

  it("rejects scientific-notation Content-Length", async () => {
    const kit = securekit({ headers: false, bodyLimit: "1kb" });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "POST",
        url: "/",
        headers: { "content-length": "1e999" },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 400);
    kit.destroy();
  });

  it("rejects excess header count", async () => {
    const kit = securekit({ headers: false });
    const headers: Record<string, string> = {};
    for (let i = 0; i < 150; i += 1) {
      headers[`x-h-${i}`] = "v";
    }
    const result = await kit.handle(
      createSecureKitContextFromHeaders({ method: "GET", url: "/", headers }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 413);
    kit.destroy();
  });
});

describe("CORS and origin manipulation", () => {
  it("does not reflect attacker origin in Allow-Origin on rejection", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://trusted.example"] },
    });
    const evil = "https://evil.example";
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { origin: evil },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") {
      assert.notEqual(result.headers?.["access-control-allow-origin"], evil);
    }
    kit.destroy();
  });

  it("rejects wildcard substring origin tricks", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
    });
    const result = await kit.handle(
      createSecureKitContextFromHeaders({
        method: "GET",
        url: "/",
        headers: { origin: "https://example.com.evil.net" },
      }),
    );
    assert.equal(result.kind, "respond");
    if (result.kind === "respond") assert.equal(result.status, 403);
    kit.destroy();
  });
});

describe("forwarded IP manipulation", () => {
  it("rate limits by socket remoteAddress, not X-Forwarded-For header alone", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000, keyBy: "ip" },
    });

    const spoofed = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
      remoteAddress: "203.0.113.5",
    });
    await kit.handle(spoofed);

    const sameSocket = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { "x-forwarded-for": "9.9.9.9" },
      remoteAddress: "203.0.113.5",
    });
    const blocked = await kit.handle(sameSocket);
    assert.equal(blocked.kind, "respond");
    if (blocked.kind === "respond") assert.equal(blocked.status, 429);
    kit.destroy();
  });
});

describe("rate-limit boundary abuse", () => {
  it("handles window boundary without throwing", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: {
        limit: 2,
        window: 50,
        store: new MemoryStore({ maxStoreEntries: 100, sweepIntervalMs: 0 }),
      },
    });

    for (let i = 0; i < 5; i += 1) {
      const result = await kit.handle(
        createSecureKitContextFromHeaders({
          method: "GET",
          url: "/",
          headers: {},
          remoteAddress: "198.51.100.99",
        }),
      );
      assert.ok(result.kind === "continue" || result.kind === "respond");
    }
    kit.destroy();
  });
});

describe("plugin misconfiguration", () => {
  it("rejects plugins without compile function", () => {
    assert.throws(
      () => securekit({
          headers: false,
          plugins: [{ name: "bad" } as never],
        }),
      ConfigurationError,
    );
  });

  it("plugin runtime throw does not corrupt compiled pipeline", async () => {
    const kit = securekit({
      headers: false,
      plugins: [
        {
          name: "throws",
          compile(steps) {
            steps.push(() => {
              throw new Error("plugin failure");
            });
          },
        },
      ],
    });

    await assert.rejects(
      () =>
        kit.handle(
          createSecureKitContextFromHeaders({ method: "GET", url: "/", headers: {} }),
        ),
      /plugin failure/,
    );
    kit.destroy();
  });
});

describe("denial-of-service resistance", () => {
  it("MemoryStore stays bounded under high-cardinality attack", () => {
    const store = new MemoryStore({ maxStoreEntries: 200, sweepIntervalMs: 0 });
    for (let i = 0; i < 50_000; i += 1) {
      store.increment(`attacker-${i}`, 60_000);
    }
    assert.ok(store.size() <= 200);
    store.destroy();
  });
});
