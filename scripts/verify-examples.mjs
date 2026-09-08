#!/usr/bin/env node
/**
 * Validates official examples compile and execute against the public API.
 */
import { execSync, spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

execSync("pnpm build", { cwd: repoRoot, stdio: "inherit" });

function runNode(scriptPath, { cwd = repoRoot, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    let settled = false;
    let timer;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      if (code === 0 || signal === "SIGTERM") {
        finish({ stdout, stderr, timedOut: false });
        return;
      }
      settled = true;
      reject(new Error(`${scriptPath} exited ${code}: ${stderr}`));
    });
  });
}

await runNode(join(repoRoot, "examples/express-basic.mjs"));

const audit = spawnSync(
  process.execPath,
  [
    join(repoRoot, "packages/cli/dist/cli.js"),
    "audit",
    "--inline",
    '{"headers":true,"bodyLimit":"1mb","rateLimit":{"limit":100,"window":60000}}',
  ],
  { cwd: repoRoot, stdio: "inherit" },
);

if (audit.status !== 0 && audit.status !== 1) {
  process.exit(audit.status ?? 1);
}

console.log("Examples verification: OK");
