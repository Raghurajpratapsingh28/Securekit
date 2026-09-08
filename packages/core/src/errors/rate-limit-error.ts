import { SecureKitError } from "./securekit-error.js";

export class RateLimitError extends SecureKitError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number, message = "Rate limit exceeded") {
    super(message, "RATE_LIMITED", 429);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}
