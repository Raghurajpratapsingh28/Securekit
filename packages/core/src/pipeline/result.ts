import type { SecureKitError } from "../errors/securekit-error.js";
import type { StepResult } from "../types/step.js";
import { STEP_KIND_CONTINUE, STEP_KIND_RESPOND } from "../types/step.js";

export const CONTINUE: StepResult = Object.freeze({ kind: STEP_KIND_CONTINUE });

export function respond(
  status: number,
  options: {
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly error?: SecureKitError;
  } = {},
): StepResult {
  const result: StepResult = {
    kind: STEP_KIND_RESPOND,
    status,
    ...(options.headers !== undefined ? { headers: options.headers } : {}),
    ...(options.body !== undefined ? { body: options.body } : {}),
    ...(options.error !== undefined ? { error: options.error } : {}),
  };

  return result;
}

export function isContinueResult(result: StepResult): boolean {
  return result.kind === STEP_KIND_CONTINUE;
}
