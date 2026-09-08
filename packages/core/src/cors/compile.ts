import { ConfigurationError } from "../errors/configuration-error.js";
import { CorsError } from "../errors/cors-error.js";
import type { CorsConfig, CorsOriginMatcher, SecureKitConfig } from "../types/config.js";
import type { SecureKitContext } from "../types/context.js";
import type { PipelineStep } from "../types/step.js";
import type { CorsRejectedListener } from "../observability/events.js";
import { notifyListeners } from "../observability/events.js";
import { CONTINUE, respond } from "../pipeline/result.js";

const DEFAULT_METHODS = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"];
const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization"];

export interface CompiledCors {
  readonly originSet: ReadonlySet<string> | undefined;
  readonly originMatcher: CorsOriginMatcher | undefined;
  readonly wildcard: boolean;
  readonly credentials: boolean;
  readonly methods: readonly string[];
  readonly allowedHeaders: readonly string[];
  readonly exposedHeaders: readonly string[];
  readonly maxAge: number | undefined;
  readonly allowNullOrigin: boolean;
}

function validateCorsConfig(cors: unknown): CorsConfig {
  if (typeof cors !== "object" || cors === null) {
    throw new ConfigurationError("cors must be a configuration object", {
      field: "cors",
      received: cors,
    });
  }

  const value = cors as Record<string, unknown>;

  if (value.origins === undefined) {
    throw new ConfigurationError("cors.origins is required", {
      field: "cors.origins",
      suggestion: 'Provide cors.origins as ["https://example.com"], "*", or a validation callback.',
    });
  }

  const credentials = value.credentials === true;

  if (value.origins === "*") {
    if (credentials) {
      throw new ConfigurationError(
        'cors.origins: "*" cannot be combined with cors.credentials: true (browsers reject this combination; set credentials: false, or replace "*" with an explicit origin list)',
        {
          field: "cors.origins",
          received: "*",
          suggestion: "Set credentials: false or provide an explicit origin list.",
        },
      );
    }
  }

  if (
    Array.isArray(value.origins) &&
    value.origins.some((origin) => typeof origin !== "string")
  ) {
    throw new ConfigurationError("cors.origins array must contain strings", {
      field: "cors.origins",
      received: value.origins,
    });
  }

  return cors as CorsConfig;
}

export function compileCors(config: Readonly<SecureKitConfig>): CompiledCors | undefined {
  if (config.cors === undefined) {
    return undefined;
  }

  const cors = validateCorsConfig(config.cors);
  const credentials = cors.credentials === true;

  if (cors.origins === "*") {
    return Object.freeze({
      originSet: undefined,
      originMatcher: undefined,
      wildcard: true,
      credentials,
      methods: cors.methods ?? DEFAULT_METHODS,
      allowedHeaders: cors.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS,
      exposedHeaders: cors.exposedHeaders ?? [],
      maxAge: cors.maxAge,
      allowNullOrigin: cors.allowNullOrigin === true,
    });
  }

  if (typeof cors.origins === "function") {
    return Object.freeze({
      originSet: undefined,
      originMatcher: cors.origins,
      wildcard: false,
      credentials,
      methods: cors.methods ?? DEFAULT_METHODS,
      allowedHeaders: cors.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS,
      exposedHeaders: cors.exposedHeaders ?? [],
      maxAge: cors.maxAge,
      allowNullOrigin: cors.allowNullOrigin === true,
    });
  }

  const originSet = new Set<string>(cors.origins);
  return Object.freeze({
    originSet,
    originMatcher: undefined,
    wildcard: false,
    credentials,
    methods: cors.methods ?? DEFAULT_METHODS,
    allowedHeaders: cors.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS,
    exposedHeaders: cors.exposedHeaders ?? [],
    maxAge: cors.maxAge,
    allowNullOrigin: cors.allowNullOrigin === true,
  });
}

async function isOriginAllowed(
  compiled: CompiledCors,
  origin: string,
): Promise<boolean> {
  if (origin === "null") {
    return compiled.allowNullOrigin;
  }

  if (compiled.wildcard) {
    return true;
  }

  if (compiled.originSet !== undefined) {
    return compiled.originSet.has(origin);
  }

  if (compiled.originMatcher !== undefined) {
    return Boolean(await compiled.originMatcher(origin));
  }

  return false;
}

function applyCorsHeaders(
  ctx: SecureKitContext,
  compiled: CompiledCors,
  origin: string | undefined,
): void {
  if (origin === undefined) {
    return;
  }

  if (compiled.credentials) {
    ctx.responseHeaders.set("Access-Control-Allow-Origin", origin);
    ctx.responseHeaders.set("Access-Control-Allow-Credentials", "true");
  } else if (compiled.wildcard) {
    ctx.responseHeaders.set("Access-Control-Allow-Origin", "*");
  } else {
    ctx.responseHeaders.set("Access-Control-Allow-Origin", origin);
  }

  if (compiled.exposedHeaders.length > 0) {
    ctx.responseHeaders.set(
      "Access-Control-Expose-Headers",
      compiled.exposedHeaders.join(", "),
    );
  }
}

function isPreflightRequest(ctx: SecureKitContext): boolean {
  return (
    ctx.method.toUpperCase() === "OPTIONS" &&
    ctx.headers.has("origin") &&
    ctx.headers.has("access-control-request-method")
  );
}

/** Apply Allow-Origin headers when the request Origin is permitted (e.g. on 429 responses). */
export async function applyCorsHeadersIfOriginAllowed(
  ctx: SecureKitContext,
  compiled: CompiledCors,
): Promise<void> {
  const origin = ctx.headers.get("origin");
  if (origin === undefined) {
    return;
  }

  const allowed = await isOriginAllowed(compiled, origin);
  if (allowed) {
    applyCorsHeaders(ctx, compiled, origin);
  }
}

export function compileCorsSteps(
  steps: PipelineStep[],
  compiled: CompiledCors | undefined,
  onRejected: readonly CorsRejectedListener[] = [],
): void {
  if (compiled === undefined) {
    return;
  }

  steps.push(async (ctx: SecureKitContext) => {
    const origin = ctx.headers.get("origin");

    if (origin !== undefined) {
      const allowed = await isOriginAllowed(compiled, origin);
      if (!allowed) {
        notifyListeners(onRejected, { origin });
        return respond(403, {
          error: new CorsError(origin, "CORS origin not allowed"),
        });
      }

      applyCorsHeaders(ctx, compiled, origin);
    }

    if (isPreflightRequest(ctx)) {
      ctx.responseHeaders.set(
        "Access-Control-Allow-Methods",
        compiled.methods.join(", "),
      );
      ctx.responseHeaders.set(
        "Access-Control-Allow-Headers",
        compiled.allowedHeaders.join(", "),
      );

      if (compiled.maxAge !== undefined) {
        ctx.responseHeaders.set("Access-Control-Max-Age", String(compiled.maxAge));
      }

      const vary = ctx.responseHeaders;
      vary.append("Vary", "Origin");
      vary.append("Vary", "Access-Control-Request-Method");
      vary.append("Vary", "Access-Control-Request-Headers");

      return respond(204);
    }

    return CONTINUE;
  });
}
