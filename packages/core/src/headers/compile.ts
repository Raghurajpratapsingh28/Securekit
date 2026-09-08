import { ConfigurationError } from "../errors/configuration-error.js";
import type { HeadersConfig, SecureKitConfig } from "../types/config.js";
import type { SecureKitContext } from "../types/context.js";
import type { PipelineStep } from "../types/step.js";
import { CONTINUE } from "../pipeline/result.js";

const DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin";

function resolveHeadersConfig(
  headers: boolean | HeadersConfig | undefined,
): HeadersConfig | undefined {
  if (headers === false) {
    return undefined;
  }

  if (headers === undefined || headers === true) {
    return {};
  }

  if (typeof headers !== "object" || headers === null) {
    throw new ConfigurationError("headers must be a boolean or configuration object", {
      field: "headers",
      received: headers,
    });
  }

  return headers;
}

export function isHeadersEnabled(config: Readonly<SecureKitConfig>): boolean {
  return config.headers !== false;
}

export function compileHeaderBlocks(
  config: Readonly<SecureKitConfig>,
): ReadonlyMap<string, string> {
  const resolved = resolveHeadersConfig(config.headers);
  if (resolved === undefined) {
    return new Map();
  }

  const blocks = new Map<string, string>();

  if (resolved.xContentTypeOptions !== false) {
    blocks.set("x-content-type-options", "nosniff");
  }

  const frameOptions = resolved.xFrameOptions ?? "SAMEORIGIN";
  if (frameOptions !== undefined) {
    blocks.set("x-frame-options", frameOptions);
  }

  const referrerPolicy = resolved.referrerPolicy ?? DEFAULT_REFERRER_POLICY;
  if (referrerPolicy.length > 0) {
    blocks.set("referrer-policy", referrerPolicy);
  }

  if (resolved.permissionsPolicy !== undefined && resolved.permissionsPolicy.length > 0) {
    blocks.set("permissions-policy", resolved.permissionsPolicy);
  }

  if (resolved.hsts !== undefined) {
    if (resolved.hsts.acknowledge !== true) {
      throw new ConfigurationError(
        "headers.hsts requires acknowledge: true because HSTS can lock users out when misconfigured",
        {
          field: "headers.hsts.acknowledge",
          received: resolved.hsts.acknowledge,
          suggestion: "Add acknowledge: true after confirming the app is fully served over HTTPS.",
        },
      );
    }

    const parts = [`max-age=${resolved.hsts.maxAge}`];
    if (resolved.hsts.includeSubDomains === true) {
      parts.push("includeSubDomains");
    }
    if (resolved.hsts.preload === true) {
      parts.push("preload");
    }
    blocks.set("strict-transport-security", parts.join("; "));
  }

  if (resolved.csp !== undefined && resolved.csp.length > 0) {
    blocks.set("content-security-policy", resolved.csp);
  }

  if (resolved.cspReportOnly !== undefined && resolved.cspReportOnly.length > 0) {
    blocks.set("content-security-policy-report-only", resolved.cspReportOnly);
  }

  return blocks;
}

export function compileHeadersSteps(
  steps: PipelineStep[],
  config: Readonly<SecureKitConfig>,
  headerBlocks: ReadonlyMap<string, string>,
): void {
  if (!isHeadersEnabled(config) || headerBlocks.size === 0) {
    return;
  }

  steps.push((ctx: SecureKitContext) => {
    for (const [name, value] of headerBlocks) {
      ctx.responseHeaders.set(name, value);
    }
    return CONTINUE;
  });
}
