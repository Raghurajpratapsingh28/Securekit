import type { SecureKitContext } from "../types/context.js";
import type { PipelineStep, StepResult } from "../types/step.js";
import { CONTINUE, isContinueResult } from "./result.js";

export type PipelineHandler = (
  ctx: SecureKitContext,
) => Promise<StepResult>;

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Promise<T>).then === "function"
  );
}

async function runSteps(
  steps: ReadonlyArray<PipelineStep>,
  ctx: SecureKitContext,
): Promise<StepResult> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step === undefined) {
      continue;
    }

    let result = step(ctx);
    if (isPromise(result)) {
      result = await result;
    }

    if (!isContinueResult(result)) {
      return result;
    }
  }

  return CONTINUE;
}

export function createRunner(
  steps: ReadonlyArray<PipelineStep>,
): PipelineHandler {
  if (steps.length === 0) {
    return async () => CONTINUE;
  }

  return (ctx: SecureKitContext) => runSteps(steps, ctx);
}
