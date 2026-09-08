#!/usr/bin/env node
/**
 * Phase 11 — hot-path microbenchmarks for individual pipeline components.
 * Labels results as "Phase 11 baseline" — not historical comparisons.
 */
import { performance } from "node:perf_hooks";
import { securekit } from "../packages/core/dist/index.js";
import {
  createSecureKitContextFromHeaders,
  MemoryStore,
} from "../packages/core/dist/internal.js";

const ITERATIONS = Number(process.env.MICROBENCH_ITER ?? 5000);

function bench(name, fn) {
  for (let i = 0; i < 100; i += 1) fn();
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) fn();
  const elapsedMs = performance.now() - start;
  return {
    name,
    iterations: ITERATIONS,
    totalMs: Number(elapsedMs.toFixed(3)),
    perOpUs: Number(((elapsedMs * 1000) / ITERATIONS).toFixed(3)),
  };
}

async function benchAsync(name, fn) {
  for (let i = 0; i < 20; i += 1) await fn();
  const start = performance.now();
  for (let i = 0; i < Math.min(ITERATIONS, 1000); i += 1) await fn();
  const count = Math.min(ITERATIONS, 1000);
  const elapsedMs = performance.now() - start;
  return {
    name,
    iterations: count,
    totalMs: Number(elapsedMs.toFixed(3)),
    perOpUs: Number(((elapsedMs * 1000) / count).toFixed(3)),
  };
}

const ctxHeaders = { method: "GET", url: "/", headers: { origin: "https://example.com" } };
const ctxReject = {
  method: "GET",
  url: "/",
  headers: { origin: "https://evil.example" },
};

const kits = {
  structural: ({ headers: false }),
  headers: ({ headers: true }),
  cors: ({ headers: false, cors: { origins: ["https://example.com"] } }),
  bodyLimit: ({ headers: false, bodyLimit: "1mb" }),
  requestId: ({ headers: false, requestId: true }),
  rateLimit: ({
    headers: false,
    rateLimit: { limit: 1_000_000, window: 60_000, store: new MemoryStore({ sweepIntervalMs: 0 }) },
  }),
  apiKey: ({
    headers: false,
    apiKey: { validate: async (k) => (k === "valid" ? { id: "k1" } : null) },
  }),
  fullSync: ({
    headers: true,
    cors: { origins: ["https://example.com"] },
    bodyLimit: "1mb",
    requestId: true,
    rateLimit: { limit: 1_000_000, window: 60_000 },
  }),
};

const results = [];

results.push(
  bench("context-create", () => {
    createSecureKitContextFromHeaders(ctxHeaders);
  }),
);

results.push(
  await benchAsync("structural-continue", async () => {
    await kits.structural.handle(createSecureKitContextFromHeaders(ctxHeaders));
  }),
);

results.push(
  await benchAsync("headers-continue", async () => {
    await kits.headers.handle(createSecureKitContextFromHeaders(ctxHeaders));
  }),
);

results.push(
  await benchAsync("cors-reject", async () => {
    await kits.cors.handle(createSecureKitContextFromHeaders(ctxReject));
  }),
);

results.push(
  await benchAsync("body-limit-continue", async () => {
    await kits.bodyLimit.handle(createSecureKitContextFromHeaders(ctxHeaders));
  }),
);

results.push(
  await benchAsync("request-id-continue", async () => {
    await kits.requestId.handle(createSecureKitContextFromHeaders(ctxHeaders));
  }),
);

results.push(
  await benchAsync("rate-limit-continue", async () => {
    await kits.rateLimit.handle(createSecureKitContextFromHeaders(ctxHeaders));
  }),
);

results.push(
  await benchAsync("api-key-continue", async () => {
    await kits.apiKey.handle(
      createSecureKitContextFromHeaders({ ...ctxHeaders, headers: { "x-api-key": "valid" } }),
    );
  }),
);

results.push(
  await benchAsync("full-sync-continue", async () => {
    await kits.fullSync.handle(createSecureKitContextFromHeaders(ctxHeaders));
  }),
);

const report = {
  label: "Phase 11 hot-path microbenchmark (co-located, not a SLA)",
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  iterationsDefault: ITERATIONS,
  results,
};

console.log(JSON.stringify(report, null, 2));

for (const kit of Object.values(kits)) {
  kit.destroy();
}
