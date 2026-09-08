import { ConfigurationError } from "../errors/configuration-error.js";
import { compileCors, compileCorsSteps } from "../cors/compile.js";
import { compileHeaderBlocks, compileHeadersSteps } from "../headers/compile.js";
import { compileRequestId, compileRequestIdSteps } from "../request-id/compile.js";
import {
  compileRequestLimitSteps,
  compileRequestLimitStreamStep,
  compileSizeLimits,
} from "../request-limits/compile.js";
import { compileRateLimit, compileRateLimitSteps } from "../rate-limit/compile.js";
import { rateLimitKeyByUsesPresentedApiKey } from "../rate-limit/key-by.js";
import { compileApiKey, compileApiKeySteps, compileApiKeyExtractStep } from "../api-key/compile.js";
import type { ApiKeyRejectedListener, ObservabilityListeners } from "../observability/events.js";
import { compilePluginSteps, validatePluginList } from "../plugins/validate.js";
import type { CompiledConfig, SecureKitConfig } from "../types/config.js";
import type { Plugin } from "../types/plugin.js";
import type { PipelineStep } from "../types/step.js";
import type { Store } from "../types/store.js";

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "headers",
  "cors",
  "rateLimit",
  "bodyLimit",
  "requestId",
  "apiKey",
  "plugins",
]);

const UNIMPLEMENTED_KEYS = new Set<string>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMutableStore(value: object): value is Store {
  return typeof (value as Store).increment === "function";
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested !== null && typeof nested === "object" && !Object.isFrozen(nested)) {
      if (isMutableStore(nested)) {
        continue;
      }
      deepFreeze(nested);
    }
  }

  return value;
}

function assertAllowedTopLevelKeys(config: Record<string, unknown>): void {
  for (const key of Object.keys(config)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new ConfigurationError(`Invalid configuration key "${key}"`, {
        field: key,
        suggestion: "Configuration keys must be own enumerable properties.",
      });
    }

    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new ConfigurationError(`Unknown configuration key "${key}"`, {
        field: key,
        received: config[key],
        suggestion: `Did you mean one of: ${[...ALLOWED_TOP_LEVEL_KEYS].join(", ")}?`,
      });
    }

    if (UNIMPLEMENTED_KEYS.has(key)) {
      throw new ConfigurationError(
        `${key} is not available in this release (reserved for a later phase)`,
        {
          field: key,
          received: config[key],
          suggestion: "Remove this key until the API key module ships.",
        },
      );
    }
  }
}

function validatePlugins(plugins: unknown): readonly Plugin[] {
  if (!Array.isArray(plugins)) {
    throw new ConfigurationError("plugins must be an array", {
      field: "plugins",
      received: plugins,
      suggestion: 'Provide an array of plugins, e.g. plugins: [{ name: "my-plugin", compile() { ... } }]',
    });
  }

  const validated: Plugin[] = [];

  for (let i = 0; i < plugins.length; i++) {
    const plugin = plugins[i];

    if (!isPlainObject(plugin)) {
      throw new ConfigurationError(`plugins[${i}] must be an object`, {
        field: `plugins[${i}]`,
        received: plugin,
      });
    }

    if (typeof plugin.name !== "string" || plugin.name.length === 0) {
      throw new ConfigurationError(`plugins[${i}].name must be a non-empty string`, {
        field: `plugins[${i}].name`,
        received: plugin.name,
      });
    }

    if (typeof plugin.compile !== "function") {
      throw new ConfigurationError(`plugins[${i}].compile must be a function`, {
        field: `plugins[${i}].compile`,
        received: plugin.compile,
        suggestion: "compile(steps, config) { /* push zero or more PipelineStep functions */ }",
      });
    }

    validated.push({
      name: plugin.name,
      compile: plugin.compile as Plugin["compile"],
    });
  }

  return validated;
}

export interface CompilePipelineOptions {
  readonly listeners?: ObservabilityListeners;
  /** @deprecated Use listeners.apiKeyRejected */
  readonly apiKeyRejectedListeners?: ApiKeyRejectedListener[];
}

export function normalizeConfig(config: SecureKitConfig | undefined): SecureKitConfig {
  if (config === undefined) {
    return Object.freeze({});
  }

  if (!isPlainObject(config)) {
    throw new ConfigurationError("Configuration must be a plain object", {
      received: config,
      suggestion: "Call () with no arguments or pass a configuration object.",
    });
  }

  assertAllowedTopLevelKeys(config);

  const normalized: Record<string, unknown> = {};

  if (config.headers !== undefined) normalized.headers = config.headers;
  if (config.cors !== undefined) normalized.cors = config.cors;
  if (config.rateLimit !== undefined) normalized.rateLimit = config.rateLimit;
  if (config.bodyLimit !== undefined) normalized.bodyLimit = config.bodyLimit;
  if (config.requestId !== undefined) normalized.requestId = config.requestId;
  if (config.apiKey !== undefined) normalized.apiKey = config.apiKey;

  if (config.plugins !== undefined) {
    const plugins = validatePlugins(config.plugins);
    return deepFreeze({ ...normalized, plugins: validatePluginList(plugins) }) as SecureKitConfig;
  }

  return deepFreeze(normalized) as SecureKitConfig;
}

export function compilePipelineSteps(
  config: Readonly<SecureKitConfig>,
  compiledRateLimit = compileRateLimit(config),
  options: CompilePipelineOptions = {},
): ReadonlyArray<PipelineStep> {
  const steps: PipelineStep[] = [];

  const listenerRegistry = options.listeners;
  const apiKeyListeners =
    listenerRegistry?.apiKeyRejected ?? options.apiKeyRejectedListeners ?? [];

  const sizeLimits = compileSizeLimits(config);
  compileRequestLimitSteps(steps, sizeLimits, listenerRegistry?.requestLimitRejected);

  const compiledCors = compileCors(config);
  const compiledApiKey = compileApiKey(config, apiKeyListeners);

  if (
    compiledApiKey !== undefined &&
    compiledRateLimit !== undefined &&
    rateLimitKeyByUsesPresentedApiKey(compiledRateLimit.keyBy)
  ) {
    compileApiKeyExtractStep(steps, compiledApiKey);
  }

  compileRateLimitSteps(steps, compiledRateLimit, compiledCors, listenerRegistry?.rateLimitRejected);
  compileCorsSteps(steps, compiledCors, listenerRegistry?.corsRejected);

  compileRequestLimitStreamStep(steps, sizeLimits, listenerRegistry?.requestLimitRejected);

  const headerBlocks = compileHeaderBlocks(config);
  compileHeadersSteps(steps, config, headerBlocks);

  const compiledRequestId = compileRequestId(config);
  compileRequestIdSteps(steps, compiledRequestId);

  compileApiKeySteps(steps, compiledApiKey);

  compilePluginSteps(steps, config.plugins, config);

  return Object.freeze(steps);
}

export function compileCompiledArtifacts(
  config: Readonly<SecureKitConfig>,
  compiledRateLimit = compileRateLimit(config),
): Pick<
  CompiledConfig,
  "headerBlocks" | "corsOriginSet" | "corsOriginMatcher" | "rateLimit" | "sizeLimits"
> {
  const compiledCors = compileCors(config);

  return {
    headerBlocks: compileHeaderBlocks(config),
    corsOriginSet: compiledCors?.originSet,
    corsOriginMatcher: compiledCors?.originMatcher,
    rateLimit:
      compiledRateLimit === undefined
        ? undefined
        : Object.freeze({
            limit: compiledRateLimit.limit,
            windowMs: compiledRateLimit.windowMs,
            algorithm: compiledRateLimit.algorithm,
            keyBy: compiledRateLimit.keyBy,
            isAsync: compiledRateLimit.isAsync,
          }),
    sizeLimits: compileSizeLimits(config),
  };
}
