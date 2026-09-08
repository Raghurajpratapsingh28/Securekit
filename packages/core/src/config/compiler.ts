import type { CompiledRateLimit } from "../rate-limit/compile.js";
import { compileRateLimit, destroyCompiledRateLimit } from "../rate-limit/compile.js";
import type { CompiledConfig, SecureKitConfig } from "../types/config.js";
import {
  compileCompiledArtifacts,
  compilePipelineSteps,
  normalizeConfig,
} from "./validate.js";
import type { CompilePipelineOptions } from "./validate.js";

export interface CompiledConfigRuntime extends CompiledConfig {
  readonly rateLimitRuntime: CompiledRateLimit | undefined;
}

export interface CompileConfigOptions extends CompilePipelineOptions {}

export function compileConfig(
  config: SecureKitConfig | undefined,
  options: CompileConfigOptions = {},
): CompiledConfigRuntime {
  const raw = normalizeConfig(config);
  const compiledRateLimit = compileRateLimit(raw);
  const artifacts = compileCompiledArtifacts(raw, compiledRateLimit);
  const steps = compilePipelineSteps(raw, compiledRateLimit, options);

  return Object.freeze({
    steps,
    headerBlocks: Object.freeze(artifacts.headerBlocks),
    corsOriginSet: artifacts.corsOriginSet,
    corsOriginMatcher: artifacts.corsOriginMatcher,
    rateLimit: artifacts.rateLimit,
    sizeLimits: artifacts.sizeLimits,
    raw,
    rateLimitRuntime: compiledRateLimit,
  });
}

export function destroyCompiledConfig(config: CompiledConfigRuntime): void {
  destroyCompiledRateLimit(config.rateLimitRuntime);
  const store = config.rateLimitRuntime?.store;
  if (store !== undefined && typeof store.destroy === "function") {
    const result = store.destroy();
    if (result instanceof Promise) {
      void result;
    }
  }
}
