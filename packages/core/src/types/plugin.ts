import type { SecureKitConfig } from "./config.js";
import type { PipelineStep } from "./step.js";

/**
 * Compile-time extension point. Plugins push {@link PipelineStep} functions during
 * configuration — they never install a per-request dispatch wrapper.
 */
export interface Plugin {
  readonly name: string;
  compile(steps: PipelineStep[], config: Readonly<SecureKitConfig>): void;
}
