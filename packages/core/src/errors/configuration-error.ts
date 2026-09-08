import { SecureKitError } from "./securekit-error.js";

export interface ConfigurationErrorOptions {
  readonly field?: string;
  readonly received?: unknown;
  readonly suggestion?: string;
}

function formatReceivedValue(received: unknown): string {
  if (received === undefined) {
    return "undefined";
  }
  if (typeof received === "string") {
    return JSON.stringify(received);
  }
  if (typeof received === "object" && received !== null) {
    return JSON.stringify(redactReceivedValue(received));
  }
  return String(received);
}

const SENSITIVE_RECEIVED_KEYS = new Set([
  "keyHash",
  "revoked",
  "secret",
  "password",
  "token",
  "apiKey",
]);

function redactReceivedValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactReceivedValue);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_RECEIVED_KEYS.has(key)) {
      result[key] = "[redacted]";
    } else if (typeof nested === "object" && nested !== null) {
      result[key] = redactReceivedValue(nested);
    } else {
      result[key] = nested;
    }
  }
  return result;
}

export class ConfigurationError extends SecureKitError {
  readonly field: string | undefined;
  readonly received: unknown;
  readonly suggestion: string | undefined;

  constructor(message: string, options: ConfigurationErrorOptions = {}) {
    const parts: string[] = [message];

    if (options.field !== undefined) {
      parts.push(`(field: ${options.field})`);
    }

    if (options.received !== undefined) {
      parts.push(`received: ${formatReceivedValue(options.received)}`);
    }

    if (options.suggestion !== undefined) {
      parts.push(`Suggestion: ${options.suggestion}`);
    }

    super(parts.join(" "), "CONFIGURATION_ERROR", 500);
    this.name = "ConfigurationError";
    this.field = options.field;
    this.received = options.received;
    this.suggestion = options.suggestion;
  }
}
