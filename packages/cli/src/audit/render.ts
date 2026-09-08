import type { AuditReport } from "./types.js";

const ICON = {
  pass: "✓",
  warning: "⚠",
  fail: "✗",
} as const;

export function renderHumanReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("SecureKit Security Audit");
  lines.push("=".repeat(24));
  lines.push("");
  lines.push(
    "Static configuration analysis only — not a penetration test or vulnerability scan.",
  );
  lines.push("");

  for (const check of report.checks) {
    lines.push(`${ICON[check.severity]} ${check.title}`);
    lines.push(`  ${check.detail}`);
    lines.push("");
  }

  lines.push(`Security Score: ${report.score}/${report.maxScore}`);
  lines.push("");

  if (report.exitCode === 0) {
    lines.push("Result: PASS");
  } else if (report.exitCode === 1) {
    lines.push("Result: PASS WITH WARNINGS");
  } else {
    lines.push("Result: FAIL");
  }

  return lines.join("\n");
}

export function renderJsonReport(report: AuditReport): string {
  return JSON.stringify(
    {
      title: "SecureKit Security Audit",
      disclaimer:
        "Static configuration analysis only — not a penetration test or vulnerability scan.",
      score: report.score,
      maxScore: report.maxScore,
      exitCode: report.exitCode,
      checks: report.checks.map((check) => ({
        id: check.id,
        severity: check.severity,
        title: check.title,
        detail: check.detail,
      })),
    },
    null,
    2,
  );
}
