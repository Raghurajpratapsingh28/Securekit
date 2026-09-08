export type AuditSeverity = "pass" | "warning" | "fail";

export interface AuditCheck {
  readonly id: string;
  readonly severity: AuditSeverity;
  readonly title: string;
  readonly detail: string;
  readonly weight: number;
}

export interface DeploymentHints {
  readonly horizontallyScaled: boolean;
  readonly kubernetes: boolean;
  readonly replicaCount: number | undefined;
}

export interface AuditReport {
  readonly checks: readonly AuditCheck[];
  readonly score: number;
  readonly maxScore: number;
  readonly exitCode: 0 | 1 | 2;
}
