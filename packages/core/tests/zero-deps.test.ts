import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("zero runtime dependency enforcement", () => {
  it("securekit package.json declares no runtime dependencies", () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };

    assert.deepEqual(packageJson.dependencies ?? {}, {});
  });

  it("pnpm ls --prod resolves no production dependencies for securekit", () => {
    const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

    const output = execFileSync(
      "pnpm",
      ["ls", "--prod", "--filter", "@backend-master/securekit", "--json"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const packages = JSON.parse(output) as Array<{
      name: string;
      dependencies?: Record<string, unknown>;
    }>;

    assert.equal(packages.length, 1);
    assert.equal(packages[0]?.name, "@backend-master/securekit");
    assert.deepEqual(packages[0]?.dependencies ?? {}, {});
  });
});
