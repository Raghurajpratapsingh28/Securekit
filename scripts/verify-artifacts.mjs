#!/usr/bin/env node
/**
 * Phase 11 — release artifact certification.
 * Ensures published package contents are production-safe.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(repoRoot, "packages");

const PACKAGE_NAMES = [
  "securekit",
  "@securekit/express",
  "@securekit/fastify",
  "@securekit/redis",
  "@securekit/context",
  "@securekit/cli",
];

const FORBIDDEN_IN_DIST = [
  /\.test\./,
  /\.spec\./,
  /\/tests\//,
  /\/src\//,
  /\.env/,
  /credentials\.json/i,
  /tsconfig/,
];

const SECRET_PATTERNS = [
  /sk_live_[a-zA-Z0-9]+/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
];

const failures = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

for (const name of PACKAGE_NAMES) {
  const folder = name === "securekit" ? "core" : name.replace("@securekit/", "");
  const pkgPath = join(packagesDir, folder, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const distDir = join(packagesDir, folder, "dist");

  if (!statSync(distDir).isDirectory()) {
    failures.push(`${name}: dist/ missing`);
    continue;
  }

  const allowedFiles = new Set(pkg.files ?? ["dist"]);
  if (!allowedFiles.has("dist")) {
    failures.push(`${name}: files field must include dist`);
  }

  for (const file of walk(distDir)) {
    const rel = relative(join(packagesDir, folder), file);
    if (rel.endsWith(".ts") && !rel.endsWith(".d.ts")) {
      failures.push(`${name}: TypeScript source shipped in dist: ${rel}`);
    }
    for (const pattern of FORBIDDEN_IN_DIST) {
      if (pattern.test(rel)) {
        failures.push(`${name}: forbidden artifact ${rel}`);
      }
    }

    if (file.endsWith(".js") || file.endsWith(".json")) {
      const content = readFileSync(file, "utf8");
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          failures.push(`${name}: secret-like pattern in ${rel}`);
        }
      }
      if (content.includes("/Users/") || content.includes("Desktop/node_package")) {
        failures.push(`${name}: local path leaked in ${rel}`);
      }
    }
  }

  if (name === "securekit" && Object.keys(pkg.dependencies ?? {}).length > 0) {
    failures.push("securekit: runtime dependencies in package.json");
  }
}

if (failures.length > 0) {
  console.error("Artifact certification failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log("Release artifact certification: OK");
