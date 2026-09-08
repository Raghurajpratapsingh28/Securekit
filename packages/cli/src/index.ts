import { detectDeploymentHints } from "./audit/context.js";
import { cleanupAuditCompiled, runAuditChecks } from "./audit/checks.js";
import { renderHumanReport, renderJsonReport } from "./audit/render.js";
import { scoreAuditChecks } from "./audit/score.js";
import type { AuditReport } from "./audit/types.js";
import { loadConfigFromFile, parseInlineConfigJson } from "./load-config.js";
import type { SecureKitConfig } from "securekit";

export interface AuditOptions {
  readonly config?: SecureKitConfig;
  readonly configPath?: string;
  readonly json?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export async function auditConfiguration(
  options: AuditOptions = {},
): Promise<AuditReport> {
  let config = options.config;

  if (options.configPath !== undefined) {
    config = await loadConfigFromFile(options.configPath);
  }

  const deployment = detectDeploymentHints(options.env);
  const { checks, compiled } = runAuditChecks(config, deployment);

  try {
    return scoreAuditChecks(checks);
  } finally {
    cleanupAuditCompiled(compiled);
  }
}

export async function runAuditCli(argv: string[]): Promise<number> {
  const args = [...argv];
  const command = args[0];

  if (command === undefined || command === "--help" || command === "-h") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (command !== "audit") {
    process.stderr.write(`securekit: unknown command "${command}". Run securekit audit --help.\n`);
    return 2;
  }

  args.shift();

  let configPath: string | undefined;
  let inlineConfig: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--config" || arg === "-c") {
      configPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--inline") {
      inlineConfig = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    process.stderr.write(`securekit audit: unknown option "${arg}"\n`);
    return 2;
  }

  try {
    let parsedConfig: SecureKitConfig | undefined;
    if (inlineConfig !== undefined) {
      parsedConfig = parseInlineConfigJson(inlineConfig);
    }

    const report = await auditConfiguration({
      json,
      ...(parsedConfig !== undefined ? { config: parsedConfig } : {}),
      ...(configPath !== undefined ? { configPath } : {}),
    });
    process.stdout.write(`${json ? renderJsonReport(report) : renderHumanReport(report)}\n`);
    return report.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`securekit audit: ${message}\n`);
    return 2;
  }
}

function usage(): string {
  return [
    "securekit audit — static SecureKit configuration security audit",
    "",
    "Usage:",
    "  securekit audit [--config <path>] [--inline '<json>'] [--json]",
    "",
    "Examples:",
    "  securekit audit --inline '{\"headers\":true,\"bodyLimit\":\"1mb\"}'",
    "  securekit audit --config ./securekit.config.json --json",
    "",
    "Exit codes:",
    "  0  pass",
    "  1  pass with warnings",
    "  2  fail or fatal error",
    "",
    "This tool performs static analysis of your SecureKit configuration.",
    "It is not a penetration test or vulnerability scanner.",
  ].join("\n");
}

export { detectDeploymentHints } from "./audit/context.js";
export { runAuditChecks, cleanupAuditCompiled } from "./audit/checks.js";
export { scoreAuditChecks } from "./audit/score.js";
export { renderHumanReport, renderJsonReport } from "./audit/render.js";
export type { AuditCheck, AuditReport, AuditSeverity, DeploymentHints } from "./audit/types.js";
