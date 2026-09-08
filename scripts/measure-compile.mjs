#!/usr/bin/env node
/**
 * Measures () compile-time cost separately from request execution.
 */
import { performance } from "node:perf_hooks";
import { securekit } from "../packages/core/dist/index.js";
import { MemoryStore, CONTINUE } from "../packages/core/dist/internal.js";

const scenarios = [
  {
    name: "minimal",
    config: { headers: false },
  },
  {
    name: "default",
    config: undefined,
  },
  {
    name: "full-sync",
    config: {
      headers: true,
      cors: { origins: ["https://example.com"] },
      bodyLimit: "1mb",
      requestId: true,
      rateLimit: { limit: 1000, window: 60_000 },
      apiKey: { validate: async () => ({ id: "k1" }) },
    },
  },
  {
    name: "many-plugins",
    config: {
      headers: false,
      plugins: Array.from({ length: 10 }, (_, i) => ({
        name: `plugin-${i}`,
        compile(steps) {
          steps.push(() => CONTINUE);
        },
      })),
    },
  },
  {
    name: "large-cors-list",
    config: {
      headers: false,
      cors: { origins: Array.from({ length: 500 }, (_, i) => `https://app${i}.example.com`) },
    },
  },
];

function measure(name, fn, iterations = 50) {
  for (let i = 0; i < 5; i += 1) {
    fn();
  }

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    fn();
  }
  const elapsedMs = performance.now() - start;
  return elapsedMs / iterations;
}

const report = {
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  iterationsPerScenario: 50,
  results: [],
};

for (const scenario of scenarios) {
  const avgMs = measure(scenario.name, () => {
    const kit = securekit(scenario.config);
    kit.destroy();
  });

  const probe = (scenario.config);
  report.results.push({
    name: scenario.name,
    compileDestroyAvgMs: Number(avgMs.toFixed(3)),
    stepCount: probe.config.steps.length,
  });
  probe.destroy();
}

// Async store compile probe
const asyncKit = securekit({
  headers: false,
  rateLimit: {
    limit: 100,
    window: 60_000,
    store: {
      increment: async () => ({ count: 1, windowStart: Date.now(), prevCount: 0 }),
      reset: async () => undefined,
    },
  },
});
report.results.push({
  name: "async-store",
  compileDestroyAvgMs: measure("async-store", () => {
    const kit = securekit({
      headers: false,
      rateLimit: {
        limit: 100,
        window: 60_000,
        store: {
          increment: async () => ({ count: 1, windowStart: Date.now(), prevCount: 0 }),
          reset: async () => undefined,
        },
      },
    });
    kit.destroy();
  }),
  stepCount: asyncKit.config.steps.length,
  isAsync: asyncKit.config.rateLimit?.isAsync,
});
asyncKit.destroy();

console.log(JSON.stringify(report, null, 2));

const maxMs = Math.max(...report.results.map((entry) => entry.compileDestroyAvgMs));
if (maxMs > 50) {
  console.error(`Warning: slowest compile+destroy ${maxMs.toFixed(2)}ms exceeds 50ms guidance`);
}
