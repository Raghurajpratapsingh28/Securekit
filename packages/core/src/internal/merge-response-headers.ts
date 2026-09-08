import type { MutableHeaderWriter } from "../context/header-writer.js";
import type { SecureKitContext } from "../types/context.js";
import type { StepResult } from "../types/step.js";

/** Merge responseHeaders from ctx into a StepResult for adapter use. */
export function mergeResponseHeaders(
  ctx: SecureKitContext,
  result: StepResult,
): StepResult {
  if (result.kind !== "respond") {
    return result;
  }

  const writer = ctx.responseHeaders as MutableHeaderWriter;
  if (typeof writer.entries !== "function") {
    return result;
  }

  const merged: Record<string, string> = { ...(result.headers ?? {}) };
  for (const [name, values] of writer.entries()) {
    merged[name] = values.join(", ");
  }

  return {
    ...result,
    headers: merged,
  };
}
