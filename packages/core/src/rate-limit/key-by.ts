import type { SecureKitContext } from "../types/context.js";
import { ConfigurationError } from "../errors/configuration-error.js";

const KEY_DELIMITER = "\u0000";

export type RateLimitKeyBy =
  | "ip"
  | "apiKey"
  | "ip+apiKey"
  | ((ctx: SecureKitContext) => string);

export function rateLimitKeyByUsesPresentedApiKey(keyBy: RateLimitKeyBy): boolean {
  return keyBy === "apiKey" || keyBy === "ip+apiKey";
}

export function resolveRateLimitKey(
  ctx: SecureKitContext,
  keyBy: RateLimitKeyBy,
): string {
  if (typeof keyBy === "function") {
    return keyBy(ctx);
  }

  const ip = ctx.remoteAddress ?? "unknown";

  switch (keyBy) {
    case "ip":
      return ip;
    case "apiKey": {
      const material = ctx.state.rateLimitKeyMaterial ?? ctx.state.apiKey?.id;
      if (typeof material === "string" && material.length > 0) {
        return material;
      }
      return `${ip}${KEY_DELIMITER}anonymous`;
    }
    case "ip+apiKey": {
      const material = ctx.state.rateLimitKeyMaterial ?? ctx.state.apiKey?.id;
      if (typeof material === "string" && material.length > 0) {
        return `${ip}${KEY_DELIMITER}${material}`;
      }
      return ip;
    }
    default:
      return ip;
  }
}

export function validateRateLimitKeyBy(keyBy: unknown, field: string): RateLimitKeyBy {
  if (
    keyBy === "ip" ||
    keyBy === "apiKey" ||
    keyBy === "ip+apiKey"
  ) {
    return keyBy;
  }

  if (typeof keyBy === "function") {
    return keyBy as (ctx: SecureKitContext) => string;
  }

  throw new ConfigurationError("rateLimit.keyBy must be ip, apiKey, ip+apiKey, or a function", {
    field,
    received: keyBy,
  });
}
