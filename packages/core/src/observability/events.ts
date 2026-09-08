import type { AuthenticationFailureReason } from "../errors/authentication-error.js";
import type { RequestLimitType } from "../errors/request-limit-error.js";

export type RateLimitRejectedEvent = {
  readonly key: string;
  readonly limit: number;
  readonly retryAfterMs: number;
};

export type CorsRejectedEvent = {
  readonly origin: string | undefined;
};

export type RequestLimitRejectedEvent = {
  readonly limitType: RequestLimitType;
  readonly limitBytes: number;
  readonly actualBytes?: number;
};

export type ApiKeyRejectedEvent = {
  readonly reason: AuthenticationFailureReason;
};

export type RateLimitRejectedListener = (event: RateLimitRejectedEvent) => void;
export type CorsRejectedListener = (event: CorsRejectedEvent) => void;
export type RequestLimitRejectedListener = (event: RequestLimitRejectedEvent) => void;
export type ApiKeyRejectedListener = (event: ApiKeyRejectedEvent) => void;

export type SecureKitEvent = keyof SecureKitEventPayload;

export type SecureKitEventPayload = {
  "rate-limit.rejected": RateLimitRejectedEvent;
  "cors.rejected": CorsRejectedEvent;
  "request-limit.rejected": RequestLimitRejectedEvent;
  "api-key.rejected": ApiKeyRejectedEvent;
};

export interface ObservabilityListeners {
  readonly rateLimitRejected: RateLimitRejectedListener[];
  readonly corsRejected: CorsRejectedListener[];
  readonly requestLimitRejected: RequestLimitRejectedListener[];
  readonly apiKeyRejected: ApiKeyRejectedListener[];
}

export function createObservabilityListeners(): ObservabilityListeners {
  return {
    rateLimitRejected: [],
    corsRejected: [],
    requestLimitRejected: [],
    apiKeyRejected: [],
  };
}

export function notifyListeners<TListener extends (event: never) => void>(
  listeners: readonly TListener[],
  event: Parameters<TListener>[0],
): void {
  if (listeners.length === 0) {
    return;
  }

  for (let i = 0; i < listeners.length; i += 1) {
    const listener = listeners[i];
    if (listener !== undefined) {
      listener(event);
    }
  }
}
