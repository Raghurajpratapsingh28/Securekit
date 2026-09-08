import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const BUILTIN_PREFIX = "node:";
const FORBIDDEN_IMPORTS = [
  "express",
  "fastify",
  "ioredis",
  "redis",
  "@types/express",
  "@types/fastify",
];

describe("architecture constraints", () => {
  it("core source does not import Express, Fastify, or Redis", () => {
    const srcRoot = new URL("../src", import.meta.url).pathname;
    const imports = collectImports(srcRoot);

    for (const entry of imports) {
      for (const forbidden of FORBIDDEN_IMPORTS) {
        assert.notEqual(
          entry.specifier,
          forbidden,
          `Forbidden import "${forbidden}" found in ${entry.file}`,
        );
        assert.doesNotMatch(
          entry.specifier,
          new RegExp(`^${forbidden}/`),
          `Forbidden import prefix "${forbidden}/" found in ${entry.file}`,
        );
      }
    }
  });

  it("core source imports only relative modules or node built-ins", () => {
    const srcRoot = new URL("../src", import.meta.url).pathname;
    const imports = collectImports(srcRoot);

    for (const entry of imports) {
      const allowed =
        entry.specifier.startsWith("./") ||
        entry.specifier.startsWith("../") ||
        entry.specifier.startsWith(BUILTIN_PREFIX);

      assert.equal(
        allowed,
        true,
        `Disallowed import "${entry.specifier}" in ${entry.file}`,
      );
    }
  });
});

interface ImportEntry {
  file: string;
  specifier: string;
}

function collectImports(directory: string): ImportEntry[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  const imports: ImportEntry[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      imports.push(...collectImports(fullPath));
      continue;
    }

    if (!entry.name.endsWith(".ts")) {
      continue;
    }

    const source = readFileSync(fullPath, "utf8");
    const importRegex = /\bfrom\s+["']([^"']+)["']/g;
    let match: RegExpExecArray | null = importRegex.exec(source);

    while (match !== null) {
      imports.push({ file: fullPath, specifier: match[1] ?? "" });
      match = importRegex.exec(source);
    }
  }

  return imports;
}
