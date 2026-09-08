import { SecureKitError } from "./securekit-error.js";

export type RequestLimitType = "body" | "header" | "url";

export class RequestLimitError extends SecureKitError {
  readonly limitType: RequestLimitType;
  readonly limitBytes: number;

  constructor(
    limitType: RequestLimitType,
    limitBytes: number,
    message?: string,
  ) {
    super(
      message ?? `Request ${limitType} limit exceeded`,
      "REQUEST_LIMIT_EXCEEDED",
      413,
    );
    this.name = "RequestLimitError";
    this.limitType = limitType;
    this.limitBytes = limitBytes;
  }
}
