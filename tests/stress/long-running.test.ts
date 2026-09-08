/**
 * Long-running stability probe — detects unbounded heap growth under sustained load.
 * CI runs a shortened iteration count; set STRESS_LONG=1 for extended local runs.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { securekit } from "../../packages/core/dist/index.js";
import { createSecureKitContextFromHeaders } from "../../packages/core/dist/internal.js";
import { MemoryStore } from "../../packages/core/dist/rate-limit/memory-store.js";

const LONG = process.env.STRESS_LONG === "1";
const iterations = LONG ? 50_000 : 5_000;

describe("long-running stability", () => {
  it(`sustained handle loop (${iterations} requests) without unbounded heap growth`, async () => {
    const store = new MemoryStore({ maxStoreEntries: 1_000, sweepIntervalMs: 100 });
    const kit = securekit({
      headers: true,
      cors: { origins: ["https://example.com"] },
      bodyLimit: "1kb",
      requestId: true,
      rateLimit: { limit: 10_000, window: 60_000, store },
    });

    if (global.gc) {
      global.gc();
    }
    const heapBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i += 1) {
      const ctx = createSecureKitContextFromHeaders({
        method: "GET",
        url: `/path-${i % 100}`,
        headers: {
          origin: "https://example.com",
          "x-forwarded-for": `10.0.${(i % 250) >> 8}.${i % 250}`,
        },
        remoteAddress: `203.0.113.${i % 200}`,
      });
      await kit.handle(ctx);
    }

    if (global.gc) {
      global.gc();
    }
    const heapAfter = process.memoryUsage().heapUsed;
    const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024;

    assert.ok(
      heapDeltaMb < 80,
      `heap grew ${heapDeltaMb.toFixed(1)}MB over ${iterations} requests — possible leak`,
    );
    assert.ok(store.size() <= 1_000, "MemoryStore exceeded maxStoreEntries");
    kit.destroy();
    assert.equal(store.size(), 0);
  });

  it("observability listeners do not accumulate per request", async () => {
    const events = [];
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://allowed.example"] },
    });
    kit.on("cors.rejected", (evt) => events.push(evt));

    for (let i = 0; i < 100; i += 1) {
      await kit.handle(
        createSecureKitContextFromHeaders({
          method: "GET",
          url: "/",
          headers: { origin: "https://blocked.example" },
        }),
      );
    }

    assert.equal(events.length, 100);
    kit.destroy();
  });
});
