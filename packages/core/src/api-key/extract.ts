import type { SecureKitContext } from "../types/context.js";

const DEFAULT_HEADER = "x-api-key";

export function defaultApiKeyExtractor(ctx: SecureKitContext): string | undefined {
  const value = ctx.headers.get(DEFAULT_HEADER);
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}
