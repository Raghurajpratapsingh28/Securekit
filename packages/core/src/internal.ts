/**
 * @backend-master/securekit/internal
 *
 * Unstable adapter, plugin, and compiler contracts. Not covered by semver.
 * Import from @backend-master/securekit/internal only when building adapters or plugins.
 */

export { createSecureKitContext, createSecureKitContextFromHeaders, resetSecureKitState } from "./context/create-context.js";
export { createReadonlyHeaderMap } from "./context/header-map.js";
export { readResponseHeaders } from "./context/read-response-headers.js";
export { createHeaderWriter } from "./context/header-writer.js";
export type { MutableHeaderWriter } from "./context/header-writer.js";

export { compileConfig, destroyCompiledConfig } from "./config/compiler.js";
export type { CompiledConfigRuntime, CompileConfigOptions } from "./config/compiler.js";
export {
  compileCompiledArtifacts,
  compilePipelineSteps,
  normalizeConfig,
} from "./config/validate.js";
export type { CompilePipelineOptions } from "./config/validate.js";

export { compileCors } from "./cors/compile.js";
export { compileHeaderBlocks, compileHeadersSteps, isHeadersEnabled } from "./headers/compile.js";
export { compileRequestId, compileRequestIdSteps } from "./request-id/compile.js";
export {
  compileRequestLimitSteps,
  compileRequestLimitStreamStep,
  compileSizeLimits,
  consumeMonitoredBody,
} from "./request-limits/compile.js";

export { compileRateLimit, compileRateLimitSteps, destroyCompiledRateLimit } from "./rate-limit/compile.js";
export type { CompiledRateLimit } from "./rate-limit/compile.js";
export { MemoryStore, isAsyncStore } from "./rate-limit/memory-store.js";
export type { MemoryStoreOptions } from "./rate-limit/memory-store.js";
export {
  evaluateSlidingWindowCounter,
  normalizeSlidingWindowRecord,
} from "./rate-limit/sliding-window.js";

export { compileApiKey, compileApiKeySteps, compileApiKeyExtractStep } from "./api-key/compile.js";
export type { CompiledApiKey } from "./api-key/compile.js";
export type {
  ApiKeyRejectedListener,
  ApiKeyRejectedEvent,
  CorsRejectedEvent,
  RateLimitRejectedEvent,
  RequestLimitRejectedEvent,
  SecureKitEvent,
  SecureKitEventPayload,
} from "./observability/events.js";
export { constantTimeKeyCompare, digestApiKey } from "./api-key/compare.js";

export { compilePluginSteps, validatePluginList } from "./plugins/validate.js";

export { createRunner } from "./pipeline/runner.js";
export type { PipelineHandler } from "./pipeline/runner.js";
export { CONTINUE, isContinueResult, respond } from "./pipeline/result.js";

export type { FrameworkAdapterContract } from "./types/adapter.js";
export type { Plugin } from "./types/plugin.js";
export type { RateLimitRecord, Store } from "./types/store.js";

export type {
  ApiKeyConfig,
  CompiledConfig,
  CompiledRateLimitConfig,
  CompiledSizeLimits,
  CorsConfig,
  CorsOriginMatcher,
  HeadersConfig,
  HstsConfig,
  RateLimitConfig,
  RequestIdConfig,
  SecureKitConfig,
} from "./types/config.js";

export type {
  ApiKeyMetadata,
  HeaderWriter,
  RateLimitState,
  ReadonlyHeaderMap,
  SecureKitContext,
  SecureKitContextInit,
  SecureKitState,
} from "./types/context.js";

export type { PipelineStep, StepResult } from "./types/step.js";

export {
  AuthenticationError,
  ConfigurationError,
  CorsError,
  RateLimitError,
  RequestLimitError,
  SecureKitError,
} from "./errors/index.js";

export type {
  AuthenticationFailureReason,
  ConfigurationErrorOptions,
  RequestLimitType,
} from "./errors/index.js";

export {
  generateRequestId,
  generateToken,
  hash,
  hmac,
  safeCompare,
} from "./crypto/index.js";

export { mergeResponseHeaders } from "./internal/merge-response-headers.js";
