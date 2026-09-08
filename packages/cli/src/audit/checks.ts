import { ConfigurationError } from "@securekit/core";
import { compileConfig, destroyCompiledConfig, isHeadersEnabled } from "@securekit/core/internal";
import type { SecureKitConfig } from "@securekit/core";
import type { DeploymentHints, AuditCheck } from "./types.js";

const WEIGHT_PASS = 10;
const WEIGHT_WARNING = 5;

function pass(id: string, title: string, detail: string): AuditCheck {
  return { id, severity: "pass", title, detail, weight: WEIGHT_PASS };
}

function warn(id: string, title: string, detail: string): AuditCheck {
  return { id, severity: "warning", title, detail, weight: WEIGHT_WARNING };
}

function fail(id: string, title: string, detail: string): AuditCheck {
  return { id, severity: "fail", title, detail, weight: 0 };
}

function redactConfigSummary(config: SecureKitConfig): string {
  const keys = Object.keys(config as object).sort();
  return keys.length === 0 ? "(default securekit())" : `{ ${keys.join(", ")} }`;
}

export function runAuditChecks(
  config: SecureKitConfig | undefined,
  deployment: DeploymentHints,
): { checks: AuditCheck[]; compiled?: ReturnType<typeof compileConfig> } {
  const checks: AuditCheck[] = [];
  let compiled: ReturnType<typeof compileConfig> | undefined;

  try {
    compiled = compileConfig(config);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      checks.push(
        fail(
          "config-valid",
          "Configuration is invalid",
          `${error.message}${error.field ? ` (field: ${error.field})` : ""}`,
        ),
      );
      return { checks };
    }
    throw error;
  }

  checks.push(
    pass(
      "config-valid",
      "Configuration compiles successfully",
      `Resolved top-level keys: ${redactConfigSummary(compiled.raw)}`,
    ),
  );

  auditHeaders(compiled, checks);
  auditRequestLimits(compiled, checks);
  auditRateLimit(compiled, config, deployment, checks);
  auditCors(compiled, config, checks);
  auditApiKey(config, checks);
  auditPlugins(config, checks);
  auditProxyRateLimitKeying(config, deployment, checks);

  return { checks, compiled };
}

function auditHeaders(
  compiled: ReturnType<typeof compileConfig>,
  checks: AuditCheck[],
): void {
  if (!isHeadersEnabled(compiled.raw)) {
    checks.push(
      warn(
        "headers-disabled",
        "Security headers are disabled",
        "Set headers: true (default) or provide a headers configuration object.",
      ),
    );
    return;
  }

  const blocks = compiled.headerBlocks;
  const required = [
    ["x-content-type-options", "X-Content-Type-Options"],
    ["x-frame-options", "X-Frame-Options"],
    ["referrer-policy", "Referrer-Policy"],
  ] as const;

  const missing = required.filter(([key]) => !blocks.has(key)).map(([, label]) => label);

  if (missing.length > 0) {
    checks.push(
      warn(
        "headers-incomplete",
        "Security headers are partially configured",
        `Missing recommended headers: ${missing.join(", ")}`,
      ),
    );
    return;
  }

  checks.push(
    pass(
      "headers-enabled",
      "Security headers enabled",
      "X-Content-Type-Options, X-Frame-Options, and Referrer-Policy are configured.",
    ),
  );

  if (blocks.has("strict-transport-security")) {
    checks.push(
      pass(
        "headers-hsts",
        "Strict-Transport-Security configured",
        "HSTS is enabled with compile-time acknowledgement.",
      ),
    );
  }
}

function auditRequestLimits(
  compiled: ReturnType<typeof compileConfig>,
  checks: AuditCheck[],
): void {
  if (compiled.sizeLimits.maxBodyBytes === undefined) {
    checks.push(
      warn(
        "request-limits-missing",
        "Request body size limit is not configured",
        "Set bodyLimit to reject oversized payloads before the body is read. Structural URL/header limits are always active.",
      ),
    );
    return;
  }

  checks.push(
    pass(
      "request-limits-configured",
      "Request size limits configured",
      `bodyLimit=${compiled.sizeLimits.maxBodyBytes} bytes with structural header/url guards.`,
    ),
  );
}

function auditRateLimit(
  compiled: ReturnType<typeof compileConfig>,
  config: SecureKitConfig | undefined,
  deployment: DeploymentHints,
  checks: AuditCheck[],
): void {
  if (compiled.rateLimit === undefined) {
    checks.push(
      warn(
        "rate-limit-missing",
        "Rate limiting is not configured",
        "Add rateLimit to protect against abuse. MemoryStore is per-instance.",
      ),
    );
    return;
  }

  checks.push(
    pass(
      "rate-limit-present",
      "Rate limiting is configured",
      `limit=${compiled.rateLimit.limit}, window=${compiled.rateLimit.windowMs}ms, algorithm=${compiled.rateLimit.algorithm}.`,
    ),
  );

  const usesDefaultMemoryStore =
    config?.rateLimit !== undefined && config.rateLimit.store === undefined;

  if (usesDefaultMemoryStore && deployment.horizontallyScaled) {
    checks.push(
      warn(
        "rate-limit-memorystore-scaled",
        "In-memory rate limiting in a horizontally scaled deployment",
        "MemoryStore limits are per process. Use @securekit/redis RedisStore or another shared Store for cluster-wide limits.",
      ),
    );
  }

  if (compiled.rateLimit.isAsync) {
    checks.push(
      pass(
        "rate-limit-async-store",
        "Async rate-limit store configured",
        "The compiled pipeline uses the async store path (e.g. RedisStore).",
      ),
    );
  }

  auditWeakRateLimit(compiled, checks);
}

function auditWeakRateLimit(
  compiled: ReturnType<typeof compileConfig>,
  checks: AuditCheck[],
): void {
  if (compiled.rateLimit === undefined) {
    return;
  }

  const { limit, windowMs } = compiled.rateLimit;
  const windowSeconds = windowMs / 1000;
  const effectiveRps = windowSeconds > 0 ? limit / windowSeconds : limit;

  if (effectiveRps > 10_000 || (limit >= 50_000 && windowMs <= 5_000)) {
    checks.push(
      fail(
        "rate-limit-weak",
        "Rate limit is effectively unlimited",
        `limit=${limit} over window=${windowMs}ms (~${Math.round(effectiveRps).toLocaleString()} req/s) does not meaningfully throttle abuse.`,
      ),
    );
    return;
  }

  if (effectiveRps > 1_000) {
    checks.push(
      warn(
        "rate-limit-high",
        "Rate limit allows very high throughput",
        `~${Math.round(effectiveRps).toLocaleString()} req/s — confirm this matches your abuse model.`,
      ),
    );
  }
}

function auditCors(
  compiled: ReturnType<typeof compileConfig>,
  config: SecureKitConfig | undefined,
  checks: AuditCheck[],
): void {
  if (config?.cors === undefined) {
    checks.push(
      warn(
        "cors-not-configured",
        "CORS is not configured",
        "Browser clients require explicit cors.origins. Skip only for non-browser APIs.",
      ),
    );
    return;
  }

  if (config.cors.origins === "*") {
    const credentials = config.cors.credentials === true;
    if (credentials) {
      checks.push(
        fail(
          "cors-wildcard-credentials",
          "CORS wildcard origin with credentials",
          "This combination is rejected at compile time — use explicit origins.",
        ),
      );
    } else {
      checks.push(
        warn(
          "cors-wildcard-origin",
          "CORS allows any origin (*)",
          "Confirm this is intentional for a fully public API.",
        ),
      );
    }
    return;
  }

  if (compiled.corsOriginSet !== undefined && compiled.corsOriginSet.size > 0) {
    checks.push(
      pass(
        "cors-static-origins",
        "CORS uses an explicit origin allowlist",
        `${compiled.corsOriginSet.size} static origin(s) compiled.`,
      ),
    );
  } else if (typeof config.cors.origins === "function") {
    checks.push(
      pass(
        "cors-dynamic-origins",
        "CORS uses a dynamic origin matcher",
        "Ensure the matcher rejects untrusted origins.",
      ),
    );
  }
}

function auditApiKey(config: SecureKitConfig | undefined, checks: AuditCheck[]): void {
  if (config?.apiKey === undefined) {
    checks.push(
      warn(
        "api-key-not-configured",
        "API key authentication is not configured",
        "Add apiKey when the API requires authenticated clients.",
      ),
    );
    return;
  }

  checks.push(
    pass(
      "api-key-configured",
      "API key authentication is configured",
      "validate() is required and runs after rate limiting in the pipeline.",
    ),
  );

  if (config.apiKey.extract !== undefined) {
    checks.push(
      warn(
        "api-key-custom-extract",
        "Custom API key extractor in use",
        "Ensure secrets are never logged and query-string extraction is avoided.",
      ),
    );
  }
}

function auditPlugins(config: SecureKitConfig | undefined, checks: AuditCheck[]): void {
  if (config?.plugins === undefined || config.plugins.length === 0) {
    return;
  }

  checks.push(
    pass(
      "plugins-registered",
      "Plugins registered at compile time",
      `${config.plugins.length} plugin(s) contribute pipeline steps — no runtime dispatch layer.`,
    ),
  );
}

function auditProxyRateLimitKeying(
  config: SecureKitConfig | undefined,
  deployment: DeploymentHints,
  checks: AuditCheck[],
): void {
  if (config?.rateLimit === undefined) {
    return;
  }

  const keyBy = config.rateLimit.keyBy ?? "ip";
  if (keyBy !== "ip" && keyBy !== "ip+apiKey") {
    return;
  }

  if (deployment.horizontallyScaled || deployment.kubernetes) {
    checks.push(
      warn(
        "rate-limit-ip-keying-proxy",
        "Rate limit keys by client IP",
        "Behind a reverse proxy, set ctx.remoteAddress from a trusted forwarded header in your adapter. Untrusted X-Forwarded-For enables limit bypass.",
      ),
    );
  }
}

export function cleanupAuditCompiled(
  compiled: ReturnType<typeof compileConfig> | undefined,
): void {
  if (compiled !== undefined) {
    destroyCompiledConfig(compiled);
  }
}
