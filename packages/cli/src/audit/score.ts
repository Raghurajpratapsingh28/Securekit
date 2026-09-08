import type { AuditCheck, AuditReport } from "./types.js";

export function scoreAuditChecks(checks: readonly AuditCheck[]): AuditReport {
  let score = 0;
  let maxScore = 0;
  let hasFail = false;
  let hasWarning = false;

  for (const check of checks) {
    if (check.severity === "pass") {
      maxScore += check.weight;
      score += check.weight;
    } else if (check.severity === "warning") {
      maxScore += check.weight;
      score += check.weight;
      hasWarning = true;
    } else {
      hasFail = true;
    }
  }

  const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  let exitCode: 0 | 1 | 2 = 0;
  if (hasFail) {
    exitCode = 2;
  } else if (hasWarning) {
    exitCode = 1;
  }

  return {
    checks,
    score: normalizedScore,
    maxScore: 100,
    exitCode,
  };
}
