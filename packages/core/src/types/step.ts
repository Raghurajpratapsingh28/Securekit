import type { SecureKitError } from "../errors/securekit-error.js";
import type { SecureKitContext } from "./context.js";

export type StepResult =
  | { readonly kind: "continue" }
  | {
      readonly kind: "respond";
      readonly status: number;
      readonly headers?: Readonly<Record<string, string>>;
      readonly body?: string;
      readonly error?: SecureKitError;
    };

export type PipelineStep = (
  ctx: SecureKitContext,
) => StepResult | Promise<StepResult>;

export const STEP_KIND_CONTINUE = "continue" as const;
export const STEP_KIND_RESPOND = "respond" as const;
