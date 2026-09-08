import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import * as core from "../packages/core/dist/index.js";
import * as crypto from "../packages/core/dist/crypto/index.js";
import * as internal from "../packages/core/dist/internal.js";
import * as express from "../packages/express/dist/index.js";
import * as fastify from "../packages/fastify/dist/index.js";
import * as redis from "../packages/redis/dist/index.js";
import * as context from "../packages/context/dist/index.js";
import * as cli from "../packages/cli/dist/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(
  readFileSync(join(repoRoot, "api-snapshots/v1.0.0.json"), "utf8"),
) as {
  version: string;
  packages: Record<string, readonly string[]>;
};

const RUNTIME_MODULES: Record<string, Record<string, unknown>> = {
  "securekit": core,
  "securekit/crypto": crypto,
  "securekit/internal": internal,
  "@securekit/express": express,
  "@securekit/fastify": fastify,
  "@securekit/redis": redis,
  "@securekit/context": context,
  "@securekit/cli": cli,
};

describe("v1.0.0 API snapshot", () => {
  for (const [pkg, expectedExports] of Object.entries(snapshot.packages)) {
    it(`${pkg} runtime exports match baseline`, () => {
      const mod = RUNTIME_MODULES[pkg];
      assert.ok(mod, `missing runtime module mapping for ${pkg}`);
      const actual = Object.keys(mod).sort();
      assert.deepEqual(actual, [...expectedExports].sort());
    });
  }

  it("core public entry does not expose compiler internals", () => {
    const internalOnly = [
      "compileConfig",
      "createRunner",
      "MemoryStore",
      "constantTimeKeyCompare",
      "validatePluginList",
    ];
    for (const name of internalOnly) {
      assert.equal(name in core, false, `${name} leaked to public core entry`);
    }
  });
});
