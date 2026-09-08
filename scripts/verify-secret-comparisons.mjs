#!/usr/bin/env node
/**
 * CI guard: presented API key material must not be compared with `===`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../packages/core/src/api-key/", import.meta.url).pathname;
const FORBIDDEN_PATTERNS = [
  /\bstoredKey(?:Hash(?:Hex)?)?\s*===/,
  /\bkeyHash\s*===/,
  /\bdigest\s*===/,
  /\bpresentedKey\s*===\s*['"`]/,
];

const files = collectTsFiles(ROOT);
let failed = false;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("constantTimeKeyCompare") || line.includes("timingSafeEqual")) {
      continue;
    }
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        console.error(`${file}:${i + 1}: forbidden secret comparison — ${line.trim()}`);
        failed = true;
      }
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log("Secret comparison lint: OK");

function collectTsFiles(directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      result.push(fullPath);
    }
  }
  return result;
}
