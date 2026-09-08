import { SecureKitError } from "./securekit-error.js";

export class CorsError extends SecureKitError {
  readonly origin: string | undefined;

  constructor(origin: string | undefined, message = "CORS request rejected") {
    super(message, "CORS_REJECTED", 403);
    this.name = "CorsError";
    this.origin = origin;
  }
}
