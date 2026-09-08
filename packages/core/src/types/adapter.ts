import type { SecureKitContext } from "./context.js";
import type { StepResult } from "./step.js";

export interface FrameworkAdapterContract<Req, Res> {
  toContext(req: Req, res: Res): SecureKitContext;
  applyResult(res: Res, result: StepResult): void;
}
