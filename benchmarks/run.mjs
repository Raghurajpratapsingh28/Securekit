#!/usr/bin/env node
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import autocannon from "autocannon";
import { securekit } from "../packages/core/dist/index.js";
import { MemoryStore } from "../packages/core/dist/internal.js";
import {
  createSecureKitContext,
  createReadonlyHeaderMap,
  mergeResponseHeaders,
  readResponseHeaders,
} from "../packages/core/dist/internal.js";

const smoke = process.argv.includes("--smoke");
const duration = smoke ? 2 : 10;
const connections = smoke ? 10 : 50;

const scenarios = [
  {
    name: "bare-node-http",
    createKit: null,
  },
  {
    name: "structural-only",
    createKit: () => securekit({ headers: false }),
  },
  {
    name: "headers-only",
    createKit: () => securekit({ headers: true }),
  },
  {
    name: "cors-only",
    createKit: () => securekit({
        headers: false,
        cors: { origins: ["https://example.com"] },
      }),
  },
  {
    name: "body-limit-only",
    createKit: () => securekit({
        headers: false,
        bodyLimit: "1mb",
      }),
  },
  {
    name: "rate-limit-memory",
    createKit: () => securekit({
        headers: false,
        rateLimit: {
          limit: 10_000,
          window: 60_000,
          store: new MemoryStore({ maxStoreEntries: 10_000 }),
        },
      }),
  },
  {
    name: "full-config",
    createKit: () => securekit({
        headers: true,
        cors: { origins: ["https://example.com"] },
        bodyLimit: "1mb",
        requestId: true,
        rateLimit: { limit: 10_000, window: 60_000 },
      }),
  },
  {
    name: "full-config-api-key",
    createKit: () => securekit({
        headers: true,
        cors: { origins: ["https://example.com"] },
        bodyLimit: "1mb",
        requestId: true,
        rateLimit: { limit: 10_000, window: 60_000 },
        apiKey: {
          validate: async (key) => (key === "benchmark-key" ? { id: "bench" } : null),
        },
      }),
  },
  {
    name: "rate-limit-async-memory",
    createKit: () => {
      const memory = new MemoryStore({ maxStoreEntries: 10_000 });
      return securekit({
        headers: false,
        rateLimit: {
          limit: 10_000,
          window: 60_000,
          store: {
            increment: (key, windowMs) => memory.increment(key, windowMs),
            reset: (key) => memory.reset(key),
            destroy: () => memory.destroy(),
          },
        },
      });
    },
  },
];

function createBareServer() {
  return createServer((_req, res) => {
    res.statusCode = 200;
    res.end("ok");
  });
}

function createSecureKitServer(kit) {
  return createServer(async (req, res) => {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      headers[name] = Array.isArray(value) ? value.join(", ") : value;
    }

    const ctx = createSecureKitContext({
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: createReadonlyHeaderMap(headers),
      remoteAddress: req.socket.remoteAddress,
    });

    const result = await kit.handle(ctx);
    const merged = mergeResponseHeaders(ctx, result);
    const responseHeaders =
      merged.kind === "respond" ? merged.headers ?? {} : readResponseHeaders(ctx.responseHeaders);

    for (const [name, value] of Object.entries(responseHeaders)) {
      res.setHeader(name, value);
    }

    if (merged.kind === "respond") {
      res.statusCode = merged.status;
      res.end(merged.body ?? "");
      return;
    }

    res.statusCode = 200;
    res.end("ok");
  });
}

async function runScenario(scenario) {
  const kit = scenario.createKit?.();
  const server = kit ? createSecureKitServer(kit) : createBareServer();
  const memoryBefore = process.memoryUsage();
  const startCpu = process.cpuUsage();

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  if (!smoke) {
    await autocannon({
      url: `http://127.0.0.1:${port}`,
      connections: Math.min(connections, 5),
      duration: 1,
      headers: {
        origin: "https://example.com",
        "x-api-key": "benchmark-key",
      },
    });
  }

  const benchStart = performance.now();
  const result = await autocannon({
    url: `http://127.0.0.1:${port}`,
    connections,
    duration,
    headers: {
      origin: "https://example.com",
      "x-api-key": "benchmark-key",
    },
  });
  const benchElapsedMs = performance.now() - benchStart;

  const memoryAfter = process.memoryUsage();
  const cpuDelta = process.cpuUsage(startCpu);

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  kit?.destroy?.();

  return {
    name: scenario.name,
    requestsPerSec: result.requests.average,
    latencyAvgMs: result.latency.average,
    latencyP50Ms: result.latency.p50,
    latencyP95Ms: result.latency.p95 ?? result.latency.p99 * 0.95,
    latencyP99Ms: result.latency.p99,
    throughputMbPerSec: result.throughput.average / 1024 / 1024,
    benchElapsedMs,
    cpuUserMicros: cpuDelta.user,
    cpuSystemMicros: cpuDelta.system,
    memory: {
      heapUsedDeltaMb: (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024,
      rssDeltaMb: (memoryAfter.rss - memoryBefore.rss) / 1024 / 1024,
      heapUsedMb: memoryAfter.heapUsed / 1024 / 1024,
    },
  };
}

const results = [];
for (const scenario of scenarios) {
  results.push(await runScenario(scenario));
}

const report = {
  generatedAt: new Date().toISOString(),
  nodeVersion: process.version,
  platform: process.platform,
  durationSec: duration,
  connections,
  smoke,
  results,
};

const reportJson = JSON.stringify(report, null, 2);
console.log(reportJson);

await writeFile(
  join(dirname(fileURLToPath(import.meta.url)), "latest-report.json"),
  `${reportJson}\n`,
);

const baseline = results.find((entry) => entry.name === "bare-node-http");
const full = results.find((entry) => entry.name === "full-config");

if (baseline && full && !smoke) {
  const baselineP50 = Math.max(baseline.latencyP50Ms, 0.001);
  const baselineP99 = Math.max(baseline.latencyP99Ms, 0.001);
  const overheadP50 = ((full.latencyP50Ms - baselineP50) / baselineP50) * 100;
  const overheadP99 = ((full.latencyP99Ms - baselineP99) / baselineP99) * 100;
  console.error(
    `Full-config overhead vs bare node:http — p50: ${overheadP50.toFixed(2)}%, p99: ${overheadP99.toFixed(2)}%`,
  );
}
