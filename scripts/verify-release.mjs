#!/usr/bin/env node
/**
 * Phase 8 release gate — runs the full verification suite in order.
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const steps = [
  ["pnpm install --frozen-lockfile", "install"],
  ["pnpm build", "build"],
  ["pnpm typecheck", "typecheck"],
  ["pnpm test", "test"],
  ["pnpm verify:deps", "verify:deps"],
  ["pnpm verify:import-boundaries", "verify:import-boundaries"],
  ["pnpm verify:packages", "verify:packages"],
  ["pnpm lint:secrets", "lint:secrets"],
  ["pnpm verify:api", "verify:api"],
  ["node --test tests/api-snapshot.test.ts", "api-snapshot"],
  ["pnpm verify:packaging", "verify:packaging"],
  ["pnpm verify:examples", "verify:examples"],
  ["pnpm verify:zero-deps", "verify:zero-deps"],
  ["pnpm verify:artifacts", "verify:artifacts"],
  ["pnpm verify:clean-room", "verify:clean-room"],
  ["pnpm smoke:test", "smoke:test"],
  ["pnpm benchmark:smoke", "benchmark:smoke"],
];

for (const [command, label] of steps) {
  process.stdout.write(`\n==> ${label}\n`);
  execSync(command, { cwd: repoRoot, stdio: "inherit" });
}

console.log("\nRelease verification: OK");
