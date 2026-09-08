#!/usr/bin/env node
/**
 * Validates package.json metadata, exports, and dependency boundaries.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(repoRoot, "packages");

const PACKAGE_NAMES = [
  "@securekit/core",
  "@securekit/express",
  "@securekit/fastify",
  "@securekit/redis",
  "@securekit/context",
  "@securekit/cli",
];

const EXPECTED_VERSION = "1.0.0";
const failures = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const name of PACKAGE_NAMES) {
  const folder = name === "@securekit/core" ? "core" : name.replace("@securekit/", "");
  const pkgPath = join(packagesDir, folder, "package.json");
  const pkg = readJson(pkgPath);

  if (pkg.name !== name) {
    failures.push(`${name}: name mismatch (${pkg.name})`);
  }

  if (pkg.version !== EXPECTED_VERSION) {
    failures.push(`${name}: version must be ${EXPECTED_VERSION}, got ${pkg.version}`);
  }

  if (pkg.engines?.node !== ">=18") {
    failures.push(`${name}: engines.node must be >=18`);
  }

  if (pkg.type !== "module") {
    failures.push(`${name}: type must be module`);
  }

  if (!Array.isArray(pkg.files) || !pkg.files.includes("dist")) {
    failures.push(`${name}: files must include dist`);
  }

  if (!pkg.exports?.["."]) {
    failures.push(`${name}: missing exports["."]`);
  }

  const distIndex = join(packagesDir, folder, "dist", "index.js");
  const distCli = join(packagesDir, folder, "dist", "cli.js");
  if (!existsSync(distIndex) && !existsSync(distCli)) {
    failures.push(`${name}: dist entry missing — run pnpm build`);
  }

  if (name === "@securekit/core") {
    if (Object.keys(pkg.dependencies ?? {}).length > 0) {
      failures.push("@securekit/core: must have zero runtime dependencies");
    }
  } else if (name !== "@securekit/cli") {
    const deps = pkg.dependencies ?? {};
    if (!deps["@securekit/core"]) {
      failures.push(`${name}: must depend on @securekit/core`);
    }
  }

  if (name === "@securekit/express" && !pkg.peerDependencies?.express) {
    failures.push("@securekit/express: missing express peerDependency");
  }

  if (name === "@securekit/fastify") {
    if (!pkg.peerDependencies?.fastify) {
      failures.push("@securekit/fastify: missing fastify peerDependency");
    }
    if (!pkg.dependencies?.["fastify-plugin"]) {
      failures.push("@securekit/fastify: missing fastify-plugin runtime dependency");
    }
  }

  if (name === "@securekit/redis" && !pkg.peerDependencies?.redis) {
    failures.push("@securekit/redis: missing redis peerDependency");
  }

  if (name === "@securekit/cli") {
    if (!pkg.bin?.securekit) {
      failures.push("@securekit/cli: missing securekit bin");
    }
  }
}

if (failures.length > 0) {
  console.error("Package validation failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log("Package validation: OK");
