import { compileConfig, destroyCompiledConfig } from "./config/compiler.js";
import type { CompiledConfigRuntime } from "./config/compiler.js";
import { createRunner } from "./pipeline/runner.js";
import type { CompiledSecureKit, SecureKitConfig } from "./types/config.js";
import type { SecureKitContext } from "./types/context.js";
import type { StepResult } from "./types/step.js";
import {
  createObservabilityListeners,
  type ApiKeyRejectedListener,
  type CorsRejectedListener,
  type RateLimitRejectedListener,
  type RequestLimitRejectedListener,
  type SecureKitEvent,
  type SecureKitEventPayload,
} from "./observability/events.js";

export type { SecureKitEvent, SecureKitEventPayload } from "./observability/events.js";

export function securekit(config?: SecureKitConfig): CompiledSecureKit {
  const listeners = createObservabilityListeners();
  const compiledConfig: CompiledConfigRuntime = compileConfig(config, { listeners });
  const handle = createRunner(compiledConfig.steps);

  return Object.freeze({
    config: compiledConfig,
    handle(ctx: SecureKitContext): Promise<StepResult> {
      return handle(ctx);
    },
    on<TEvent extends SecureKitEvent>(
      event: TEvent,
      handler: (payload: SecureKitEventPayload[TEvent]) => void,
    ): void {
      switch (event) {
        case "rate-limit.rejected":
          listeners.rateLimitRejected.push(handler as RateLimitRejectedListener);
          break;
        case "cors.rejected":
          listeners.corsRejected.push(handler as CorsRejectedListener);
          break;
        case "request-limit.rejected":
          listeners.requestLimitRejected.push(handler as RequestLimitRejectedListener);
          break;
        case "api-key.rejected":
          listeners.apiKeyRejected.push(handler as ApiKeyRejectedListener);
          break;
        default: {
          const _exhaustive: never = event;
          void _exhaustive;
        }
      }
    },
    destroy(): void {
      destroyCompiledConfig(compiledConfig);
    },
  });
}
