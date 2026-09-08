import { SecureKitError } from "./securekit-error.js";

export type AuthenticationFailureReason = "missing" | "invalid" | "revoked";

const REASON_MESSAGES: Record<AuthenticationFailureReason, string> = {
  missing: "API key required",
  invalid: "Authentication failed",
  revoked: "Authentication failed",
};

export class AuthenticationError extends SecureKitError {
  readonly reason: AuthenticationFailureReason;

  constructor(
    reason: AuthenticationFailureReason,
    message?: string,
  ) {
    super(message ?? REASON_MESSAGES[reason], "AUTHENTICATION_FAILED", 401);
    this.name = "AuthenticationError";
    this.reason = reason;
  }
}
