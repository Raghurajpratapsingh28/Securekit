import { ConfigurationError } from "../errors/configuration-error.js";
import { AuthenticationError } from "../errors/authentication-error.js";
import type { ApiKeyConfig, SecureKitConfig } from "../types/config.js";
import type { ApiKeyMetadata, SecureKitContext } from "../types/context.js";
import type { PipelineStep, StepResult } from "../types/step.js";
import { CONTINUE, respond } from "../pipeline/result.js";
import { constantTimeKeyCompare, digestApiKey } from "./compare.js";
import { defaultApiKeyExtractor } from "./extract.js";
import type { AuthenticationFailureReason } from "../errors/authentication-error.js";
import { notifyListeners, type ApiKeyRejectedListener } from "../observability/events.js";

export type { ApiKeyRejectedListener } from "../observability/events.js";

export interface CompiledApiKey {
  readonly extract: (ctx: SecureKitContext) => string | undefined;
  readonly validate: (
    key: string,
  ) => ApiKeyMetadata | null | Promise<ApiKeyMetadata | null>;
  readonly onRejected: readonly ApiKeyRejectedListener[];
}

function validateApiKeyConfig(apiKey: unknown): ApiKeyConfig {
  if (typeof apiKey !== "object" || apiKey === null) {
    throw new ConfigurationError("apiKey must be a configuration object", {
      field: "apiKey",
      received: apiKey,
    });
  }

  const config = apiKey as ApiKeyConfig;

  if (config.extract !== undefined && typeof config.extract !== "function") {
    throw new ConfigurationError("apiKey.extract must be a function", {
      field: "apiKey.extract",
      received: config.extract,
    });
  }

  if (config.validate === undefined || typeof config.validate !== "function") {
    throw new ConfigurationError("apiKey.validate is required and must be a function", {
      field: "apiKey.validate",
      received: config.validate,
      suggestion:
        "Provide validate: async (key) => ({ id: 'key-id', keyHash: sha256Hex }) | null",
    });
  }

  return config;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Promise<T>).then === "function"
  );
}

function notifyRejected(
  compiled: CompiledApiKey,
  reason: AuthenticationFailureReason,
): void {
  notifyListeners(compiled.onRejected, { reason });
}

function rejectAuthentication(
  compiled: CompiledApiKey,
  reason: AuthenticationFailureReason,
): StepResult {
  notifyRejected(compiled, reason);
  const error = new AuthenticationError(reason);
  return respond(error.statusCode, { error, body: error.message });
}

function stripSensitiveMetadata(metadata: ApiKeyMetadata): ApiKeyMetadata {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (key === "keyHash" || key === "revoked") {
      continue;
    }
    result[key] = value;
  }

  return result as ApiKeyMetadata;
}

function finalizeValidation(
  metadata: ApiKeyMetadata | null,
  presentedKey: string,
  compiled: CompiledApiKey,
): StepResult {
  if (metadata === null) {
    return rejectAuthentication(compiled, "invalid");
  }

  if (metadata.revoked === true) {
    return rejectAuthentication(compiled, "revoked");
  }

  if (typeof metadata.id !== "string" || metadata.id.length === 0) {
    throw new ConfigurationError(
      "apiKey.validate must return metadata with a non-empty id string",
      {
        field: "apiKey.validate",
        received: stripSensitiveMetadata(metadata as ApiKeyMetadata),
      },
    );
  }

  if (metadata.keyHash !== undefined) {
    if (
      typeof metadata.keyHash !== "string" ||
      !constantTimeKeyCompare(presentedKey, metadata.keyHash)
    ) {
      return rejectAuthentication(compiled, "invalid");
    }
  }

  return CONTINUE;
}

export function compileApiKey(
  config: Readonly<SecureKitConfig>,
  listeners: readonly ApiKeyRejectedListener[] = [],
): CompiledApiKey | undefined {
  if (config.apiKey === undefined) {
    return undefined;
  }

  const apiKey = validateApiKeyConfig(config.apiKey);

  return Object.freeze({
    extract: apiKey.extract ?? defaultApiKeyExtractor,
    validate: apiKey.validate as CompiledApiKey["validate"],
    onRejected: listeners,
  });
}

export function compileApiKeyExtractStep(
  steps: PipelineStep[],
  compiled: CompiledApiKey | undefined,
): void {
  if (compiled === undefined) {
    return;
  }

  steps.push((ctx) => {
    const presentedKey = compiled.extract(ctx);
    if (presentedKey !== undefined && presentedKey.length > 0) {
      ctx.state.rateLimitKeyMaterial = digestApiKey(presentedKey).toString("hex");
    } else {
      ctx.state.rateLimitKeyMaterial = undefined;
    }
    return CONTINUE;
  });
}

export function compileApiKeySteps(
  steps: PipelineStep[],
  compiled: CompiledApiKey | undefined,
): void {
  if (compiled === undefined) {
    return;
  }

  steps.push(async (ctx) => {
    const presentedKey = compiled.extract(ctx);

    if (presentedKey === undefined || presentedKey.length === 0) {
      return rejectAuthentication(compiled, "missing");
    }

    let validationResult = compiled.validate(presentedKey);
    if (isPromise(validationResult)) {
      validationResult = await validationResult;
    }

    const decision = finalizeValidation(validationResult, presentedKey, compiled);
    if (decision.kind !== "continue") {
      return decision;
    }

    ctx.state.apiKey = stripSensitiveMetadata(validationResult as ApiKeyMetadata);
    return CONTINUE;
  });
}
