#!/usr/bin/env node
/**
 * Simulates external consumer install from built package artifacts.
 */
import { mkdtemp, rm, cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const consumerDir = await mkdtemp(join(tmpdir(), "securekit-consumer-"));

async function copyPackage(folder, scopePath) {
  const dest = join(consumerDir, "node_modules", ...scopePath.split("/"));
  await mkdir(dest, { recursive: true });
  await cp(join(repoRoot, "packages", folder, "dist"), join(dest, "dist"), { recursive: true });
  await cp(join(repoRoot, "packages", folder, "package.json"), join(dest, "package.json"));
}

try {
  await copyPackage("core", "@securekit/core");
  await copyPackage("express", "@securekit/express");

  await mkdir(join(consumerDir, "node_modules", "@types"), { recursive: true });
  await cp(join(repoRoot, "node_modules/@types/node"), join(consumerDir, "node_modules/@types/node"), {
    recursive: true,
  });

  const expressPkgPath = join(consumerDir, "node_modules", "@securekit", "express", "package.json");
  const expressPkg = JSON.parse(await readFile(expressPkgPath, "utf8"));
  expressPkg.dependencies["@securekit/core"] = "file:../securekit";
  await writeFile(expressPkgPath, JSON.stringify(expressPkg, null, 2));

  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify({ type: "module", name: "securekit-consumer-smoke" }, null, 2),
  );

  await writeFile(
    join(consumerDir, "smoke.mjs"),
    `import { securekit } from "@securekit/core";
import { expressAdapter } from "@securekit/express";
import { safeCompare } from "@securekit/core/crypto";

const kit = securekit({ headers: true, bodyLimit: "1kb" });
if (typeof kit.handle !== "function") throw new Error("handle missing");
if (typeof expressAdapter !== "function") throw new Error("expressAdapter missing");
if (typeof safeCompare !== "function") throw new Error("safeCompare missing");
kit.destroy();
console.log("consumer smoke ok");
`,
  );

  execSync("node smoke.mjs", { cwd: consumerDir, stdio: "inherit" });

  await writeFile(
    join(consumerDir, "types.ts"),
    `import type { SecureKitConfig, CompiledSecureKit } from "@securekit/core";

declare const config: SecureKitConfig;
declare const kit: CompiledSecureKit;
`,
  );

  await writeFile(
    join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "nodenext",
          moduleResolution: "nodenext",
          noEmit: true,
          strict: true,
          types: ["node"],
        },
        include: ["types.ts"],
      },
      null,
      2,
    ),
  );

  execSync(
    `node ${JSON.stringify(join(repoRoot, "node_modules/typescript/bin/tsc"))} -p tsconfig.json`,
    { cwd: consumerDir, stdio: "inherit" },
  );

  const deps = execSync("pnpm ls --prod --filter @securekit/core --json", {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const parsed = JSON.parse(deps);
  const corePkg = parsed[0];
  if (corePkg?.dependencies && Object.keys(corePkg.dependencies).length > 0) {
    throw new Error("core has runtime dependencies");
  }

  try {
    await access(join(consumerDir, "node_modules", "@securekit", "redis"));
    throw new Error("redis package should not be present in core-only consumer");
  } catch (error) {
    if (error instanceof Error && error.message.includes("should not be present")) {
      throw error;
    }
  }

  console.log("Packaging verification: OK");
} finally {
  await rm(consumerDir, { recursive: true, force: true });
}
