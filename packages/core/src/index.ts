export { securekit } from "./kit.js";

export type {
  ApiKeyConfig,
  CompiledSecureKit,
  CorsConfig,
  CorsOriginMatcher,
  HeadersConfig,
  HstsConfig,
  RateLimitConfig,
  RequestIdConfig,
  SecureKitConfig,
} from "./types/config.js";

export {
  AuthenticationError,
  ConfigurationError,
  CorsError,
  RateLimitError,
  RequestLimitError,
  SecureKitError,
} from "./errors/index.js";

export type {
  AuthenticationFailureReason,
  ConfigurationErrorOptions,
  RequestLimitType,
} from "./errors/index.js";
