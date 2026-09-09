#!/usr/bin/env node
/**
 * Phase 11 — clean-room consumer test using only public package artifacts.
 */
import { mkdtemp, rm, cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const consumerDir = await mkdtemp(join(tmpdir(), "securekit-clean-room-"));

async function copyPackage(folder, scopePath) {
  const dest = join(consumerDir, "node_modules", ...scopePath.split("/"));
  await mkdir(dest, { recursive: true });
  await cp(join(repoRoot, "packages", folder, "dist"), join(dest, "dist"), { recursive: true });
  await cp(join(repoRoot, "packages", folder, "package.json"), join(dest, "package.json"));
}

try {
  await copyPackage("core", "@backend-master/securekit");
  for (const pkg of ["express", "cli"]) {
    await copyPackage(pkg, `@securekit/${pkg}`);
  }

  await mkdir(join(consumerDir, "node_modules", "@types"), { recursive: true });
  await cp(join(repoRoot, "node_modules/@types/node"), join(consumerDir, "node_modules/@types/node"), {
    recursive: true,
  });

  for (const pkg of ["express", "cli"]) {
    const pkgJsonPath = join(consumerDir, "node_modules", "@securekit", pkg, "package.json");
    const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf8"));
    pkgJson.dependencies = { ...(pkgJson.dependencies ?? {}), "@backend-master/securekit": "file:../core" };
    await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
  }

  await writeFile(
    join(consumerDir, "package.json"),
    JSON.stringify({ type: "module", name: "securekit-clean-room" }, null, 2),
  );

  await writeFile(
    join(consumerDir, "workflow.mjs"),
    `import { securekit } from "@backend-master/securekit";
import { expressAdapter } from "@securekit/express";
import { auditConfiguration } from "@securekit/cli";

const kit = securekit({
  headers: true,
  cors: { origins: ["https://app.example.com"] },
  bodyLimit: "1mb",
  rateLimit: { limit: 100, window: 60_000 },
  requestId: true,
  apiKey: { validate: async (key) => (key === "test-key" ? { id: "k1" } : null) },
});

if (typeof kit.handle !== "function") throw new Error("handle missing");
if (typeof expressAdapter !== "function") throw new Error("expressAdapter missing");
if (typeof auditConfiguration !== "function") throw new Error("auditConfiguration missing");

const report = await auditConfiguration({
  config: { headers: true, bodyLimit: "1mb", rateLimit: { limit: 100, window: 60_000 } },
});
if (typeof report.score !== "number") throw new Error("audit report missing score");
if (!Array.isArray(report.checks)) throw new Error("audit report missing checks");

kit.destroy();
console.log("clean-room workflow ok");
`,
  );

  execSync("node workflow.mjs", { cwd: consumerDir, stdio: "inherit" });

  console.log("Clean-room consumer test: OK");
} finally {
  await rm(consumerDir, { recursive: true, force: true });
}
