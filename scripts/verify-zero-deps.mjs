#!/usr/bin/env node
/**
 * Phase 11 — mechanical zero-runtime-dependency certification for securekit.
 * Inspects source, built dist, and package.json.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreRoot = join(repoRoot, "packages/core");
const failures = [];

const FORBIDDEN_SPECIFIERS = [
  /^express$/,
  /^fastify$/,
  /^redis$/,
  /^@securekit\//,
  /^fastify-plugin$/,
  /^autocannon$/,
  /^supertest$/,
];

const ALLOWED_NODE_BUILTINS = new Set([
  "node:assert",
  "node:assert/strict",
  "node:async_hooks",
  "node:buffer",
  "node:crypto",
  "node:events",
  "node:fs",
  "node:fs/promises",
  "node:http",
  "node:https",
  "node:net",
  "node:os",
  "node:path",
  "node:perf_hooks",
  "node:stream",
  "node:stream/promises",
  "node:timers",
  "node:url",
  "node:util",
  "node:zlib",
]);

function collectJsFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJsFiles(fullPath));
    } else if (entry.name.endsWith(".js") && !entry.name.endsWith(".map")) {
      result.push(fullPath);
    }
  }
  return result;
}

function parseImports(source) {
  const imports = [];
  const patterns = [
    /from\s+["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function checkImports(file, imports) {
  for (const specifier of imports) {
    if (FORBIDDEN_SPECIFIERS.some((p) => p.test(specifier))) {
      failures.push(`${file}: forbidden dependency "${specifier}"`);
    }
    if (specifier.startsWith("node:") && !ALLOWED_NODE_BUILTINS.has(specifier)) {
      failures.push(`${file}: non-whitelisted node builtin "${specifier}"`);
    }
    if (!specifier.startsWith(".") && !specifier.startsWith("node:")) {
      failures.push(`${file}: external runtime import "${specifier}"`);
    }
  }
}

const pkg = JSON.parse(readFileSync(join(coreRoot, "package.json"), "utf8"));
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
  failures.push("package.json declares runtime dependencies");
}

for (const file of collectJsFiles(join(coreRoot, "dist"))) {
  const source = readFileSync(file, "utf8");
  checkImports(file, parseImports(source));
  if (/eval\s*\(/.test(source)) {
    failures.push(`${file}: dynamic eval detected`);
  }
}

const lsOutput = execSync("pnpm ls --prod --filter securekit --json", {
  cwd: repoRoot,
  encoding: "utf8",
});
const packages = JSON.parse(lsOutput);
if (packages[0]?.dependencies && Object.keys(packages[0].dependencies).length > 0) {
  failures.push("pnpm ls reports production dependencies for securekit");
}

if (failures.length > 0) {
  console.error("Zero-dependency certification failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log("Zero-dependency certification: OK");
