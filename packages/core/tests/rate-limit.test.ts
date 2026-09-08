import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryStore } from "../dist/rate-limit/memory-store.js";
import {
  evaluateSlidingWindowCounter,
  normalizeSlidingWindowRecord,
} from "../dist/rate-limit/sliding-window.js";
import { compileRateLimit, compileRateLimitSteps } from "../dist/rate-limit/compile.js";
import { securekit } from "../dist/kit.js";
import { createSecureKitContextFromHeaders } from "../dist/context/create-context.js";
import { readResponseHeaders } from "../dist/context/read-response-headers.js";
import { mergeResponseHeaders } from "../dist/internal/merge-response-headers.js";
import { RateLimitError } from "../dist/errors/rate-limit-error.js";
import { ConfigurationError } from "../dist/errors/configuration-error.js";
import { CONTINUE } from "../dist/pipeline/result.js";
import type { PipelineStep } from "../dist/types/step.js";

describe("MemoryStore rate limiting", () => {
  it("uses sliding-window-counter by default", () => {
    const compiled = compileRateLimit({ rateLimit: { limit: 5, window: 60_000 } });
    assert.ok(compiled);
    assert.equal(compiled?.algorithm, "sliding-window");
    assert.equal(compiled?.isAsync, false);
  });

  it("rejects effectively unlimited configurations", () => {
    assert.throws(
      () => compileRateLimit({ rateLimit: { limit: 200_000, window: 1_000 } }),
      ConfigurationError,
    );
  });

  it("evicts LRU entries when maxStoreEntries is reached", () => {
    const store = new MemoryStore({ maxStoreEntries: 2, sweepIntervalMs: 0 });
    store.prepare("a", 60_000);
    store.prepare("b", 60_000);
    store.prepare("c", 60_000);
    assert.equal(store.size(), 2);
    store.destroy();
  });

  it("returns 429 with Retry-After and CORS headers after cors step", async () => {
    const kit = securekit({
      headers: false,
      cors: { origins: ["https://example.com"] },
      rateLimit: { limit: 1, window: 60_000 },
    });

    const ctx1 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://example.com" },
      remoteAddress: "1.2.3.4",
    });
    assert.equal((await kit.handle(ctx1)).kind, "continue");

    const ctx2 = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: { origin: "https://example.com" },
      remoteAddress: "1.2.3.4",
    });
    const result = await kit.handle(ctx2);
    assert.equal(result.kind, "respond");
    const merged = mergeResponseHeaders(ctx2, result);
    if (merged.kind === "respond") {
      assert.equal(merged.status, 429);
      assert.ok(merged.error instanceof RateLimitError);
      assert.ok(merged.headers?.["retry-after"]);
      assert.equal(merged.headers?.["access-control-allow-origin"], "https://example.com");
    }

    kit.destroy();
  });

  it("derives keys independently per remoteAddress", async () => {
    const kit = securekit({
      headers: false,
      rateLimit: { limit: 1, window: 60_000 },
    });

    const allowed = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "10.0.0.1",
    });
    const otherIp = createSecureKitContextFromHeaders({
      method: "GET",
      url: "/",
      headers: {},
      remoteAddress: "10.0.0.2",
    });

    assert.equal((await kit.handle(allowed)).kind, "continue");
    assert.equal((await kit.handle(otherIp)).kind, "continue");
    kit.destroy();
  });

  it("compiles a dedicated pipeline step with no runtime config checks", () => {
    const steps: PipelineStep[] = [];
    const compiled = compileRateLimit({ rateLimit: { limit: 10, window: 1_000 } });
    compileRateLimitSteps(steps, compiled);
    assert.equal(steps.length, 1);
    assert.notEqual(steps[0], undefined);
  });

  it("computes weighted sliding-window estimates at window boundaries", () => {
    const record = { count: 5, prevCount: 10, windowStart: Date.now() - 30_000 };
    normalizeSlidingWindowRecord(record, Date.now(), 60_000);
    const decision = evaluateSlidingWindowCounter(record, 20, 60_000, Date.now());
    assert.ok(decision.estimate > 5);
    assert.ok(decision.allowed);
  });

  it("documents per-instance behavior via compiled config metadata", () => {
    const kit = securekit({ rateLimit: { limit: 100, window: 60_000 } });
    assert.equal(kit.config.rateLimit?.limit, 100);
    assert.equal(kit.config.rateLimit?.windowMs, 60_000);
    kit.destroy();
  });
});

describe("MemoryStore concurrency", () => {
  it("handles concurrent increments without throwing", async () => {
    const store = new MemoryStore({ maxStoreEntries: 100 });
    await Promise.all(
      Array.from({ length: 100 }, (_, index) =>
        Promise.resolve().then(() => {
          const record = store.prepare(`key-${index}`, 60_000);
          normalizeSlidingWindowRecord(record, Date.now(), 60_000);
          record.count += 1;
          return CONTINUE;
        }),
      ),
    );
    assert.equal(store.size(), 100);
    store.destroy();
  });
});
