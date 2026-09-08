#!/usr/bin/env node
/**
 * Compare benchmarks/latest-report.json against benchmarks/baseline-v1.x.json.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = join(repoRoot, "benchmarks/latest-report.json");
const baselinePath = join(repoRoot, "benchmarks/baseline-v1.x.json");

if (!existsSync(latestPath)) {
  console.error("Missing benchmarks/latest-report.json — run pnpm benchmark first.");
  process.exit(1);
}

const latest = JSON.parse(readFileSync(latestPath, "utf8"));
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

if (latest.smoke) {
  console.warn("Warning: latest report is smoke mode — comparisons are indicative only.");
}

const tolerance = baseline.tolerance ?? {
  requestsPerSecMinRatio: 0.75,
  latencyP99MaxRatio: 1.35,
};

const failures = [];
const rows = [];

for (const [name, baseMetrics] of Object.entries(baseline.results)) {
  const current = latest.results.find((entry) => entry.name === name);
  if (current === undefined) {
    failures.push(`${name}: missing from latest report`);
    continue;
  }

  const throughputRatio = current.requestsPerSec / baseMetrics.requestsPerSec;
  const p99Base = Math.max(baseMetrics.latencyP99Ms, 0.001);
  const p99Ratio = current.latencyP99Ms / p99Base;
  const p99DeltaMs = current.latencyP99Ms - baseMetrics.latencyP99Ms;
  const maxP99Delta = tolerance.latencyP99MaxDeltaMs ?? 1;

  rows.push({
    name,
    throughput: `${current.requestsPerSec.toFixed(0)} vs ${baseMetrics.requestsPerSec} (${(throughputRatio * 100).toFixed(0)}%)`,
    p99: `${current.latencyP99Ms}ms vs ${baseMetrics.latencyP99Ms}ms (${(p99Ratio * 100).toFixed(0)}%)`,
  });

  if (throughputRatio < tolerance.requestsPerSecMinRatio) {
    failures.push(
      `${name}: throughput ${current.requestsPerSec.toFixed(0)} req/s below ${(tolerance.requestsPerSecMinRatio * 100).toFixed(0)}% of baseline ${baseMetrics.requestsPerSec}`,
    );
  }

  if (p99Ratio > tolerance.latencyP99MaxRatio && p99DeltaMs > maxP99Delta) {
    failures.push(
      `${name}: p99 ${current.latencyP99Ms}ms exceeds baseline ${baseMetrics.latencyP99Ms}ms (ratio ${(p99Ratio * 100).toFixed(0)}%, delta +${p99DeltaMs.toFixed(1)}ms)`,
    );
  }
}

console.log(`Baseline: ${baseline.label}`);
console.log(`Latest:   ${latest.generatedAt} (${latest.nodeVersion}, ${latest.platform}, smoke=${latest.smoke})`);
console.log("");
for (const row of rows) {
  console.log(`${row.name.padEnd(24)} throughput ${row.throughput}`);
  console.log(`${"".padEnd(24)} p99        ${row.p99}`);
}

if (failures.length > 0) {
  console.error("\nBenchmark regression detected:");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("\nBenchmark comparison: OK");
