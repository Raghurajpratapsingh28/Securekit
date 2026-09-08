#!/usr/bin/env node
/**
 * Mechanical enforcement of package dependency boundaries.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const CORE_FORBIDDEN = [
  /^express$/,
  /^fastify$/,
  /^redis$/,
  /^@securekit\/express$/,
  /^@securekit\/fastify$/,
  /^@securekit\/redis$/,
  /^@securekit\/cli$/,
  /^@securekit\/context$/,
  /^fastify-plugin$/,
];

function collectTsFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      result.push(fullPath);
    }
  }
  return result;
}

function parseImports(source) {
  const imports = [];
  const staticImport = /from\s+["']([^"']+)["']/g;
  const dynamicImport = /import\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = staticImport.exec(source)) !== null) {
    imports.push(match[1]);
  }
  while ((match = dynamicImport.exec(source)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}

const failures = [];

// @securekit/core must have zero runtime dependencies and no forbidden imports
const corePkg = JSON.parse(readFileSync(join(repoRoot, "packages/core/package.json"), "utf8"));
if (Object.keys(corePkg.dependencies ?? {}).length > 0) {
  failures.push("@securekit/core must have zero runtime dependencies");
}

for (const file of collectTsFiles(join(repoRoot, "packages/core/src"))) {
  const source = readFileSync(file, "utf8");
  for (const specifier of parseImports(source)) {
    if (CORE_FORBIDDEN.some((pattern) => pattern.test(specifier))) {
      failures.push(`${file}: forbidden import "${specifier}"`);
    }
  }
}

// Adapter packages must not import each other
const adapterRules = [
  { pkg: "express", forbidden: [/^@securekit\/fastify$/, /^fastify/] },
  { pkg: "fastify", forbidden: [/^@securekit\/express$/, /^express$/] },
  { pkg: "redis", forbidden: [/^@securekit\/express$/, /^@securekit\/fastify$/, /^express$/, /^fastify$/] },
  { pkg: "context", forbidden: [/^@securekit\/express$/, /^@securekit\/fastify$/, /^express$/, /^fastify$/] },
  { pkg: "cli", forbidden: [/^@securekit\/express$/, /^@securekit\/fastify$/, /^express$/, /^fastify$/] },
];

for (const rule of adapterRules) {
  const srcDir = join(repoRoot, "packages", rule.pkg, "src");
  for (const file of collectTsFiles(srcDir)) {
    const source = readFileSync(file, "utf8");
    for (const specifier of parseImports(source)) {
      if (rule.forbidden.some((pattern) => pattern.test(specifier))) {
        failures.push(`${file}: forbidden cross-adapter import "${specifier}"`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Import boundary verification failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log("Import boundary verification: OK");
