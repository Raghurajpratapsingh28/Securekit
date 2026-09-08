import type { ApiKeyMetadata, SecureKitContext } from "./context.js";
import type { Plugin } from "./plugin.js";
import type { Store } from "./store.js";

export interface HstsConfig {
  readonly maxAge: number;
  readonly includeSubDomains?: boolean;
  readonly preload?: boolean;
  readonly acknowledge?: boolean;
}

export interface HeadersConfig {
  readonly xContentTypeOptions?: boolean;
  readonly xFrameOptions?: "DENY" | "SAMEORIGIN";
  readonly referrerPolicy?: string;
  readonly permissionsPolicy?: string;
  readonly hsts?: HstsConfig;
  readonly csp?: string;
  readonly cspReportOnly?: string;
}

export type CorsOriginMatcher = (
  origin: string,
) => boolean | Promise<boolean>;

export interface CorsConfig {
  readonly origins: readonly string[] | "*" | CorsOriginMatcher;
  readonly credentials?: boolean;
  readonly methods?: readonly string[];
  readonly allowedHeaders?: readonly string[];
  readonly exposedHeaders?: readonly string[];
  readonly maxAge?: number;
  readonly allowNullOrigin?: boolean;
}

export interface RateLimitConfig {
  readonly limit?: number;
  readonly window?: number;
  readonly algorithm?: "sliding-window" | "token-bucket";
  readonly keyBy?: "ip" | "apiKey" | "ip+apiKey" | ((ctx: SecureKitContext) => string);
  readonly store?: Store;
  readonly maxStoreEntries?: number;
}

export interface RequestIdConfig {
  readonly header?: string;
  readonly trustIncoming?: boolean;
}

export interface ApiKeyConfig {
  readonly extract?: (ctx: SecureKitContext) => string | undefined;
  readonly validate?: (
    key: string,
  ) => ApiKeyMetadata | null | Promise<ApiKeyMetadata | null>;
}

export interface SizeLimitsConfig {
  readonly maxBodyBytes?: string | number;
  readonly maxHeaderBytes?: number;
  readonly maxHeaderCount?: number;
  readonly maxUrlLength?: number;
}

export interface SecureKitConfig {
  readonly headers?: boolean | HeadersConfig;
  readonly cors?: CorsConfig;
  readonly rateLimit?: RateLimitConfig;
  readonly bodyLimit?: string | number;
  readonly requestId?: boolean | RequestIdConfig;
  readonly apiKey?: ApiKeyConfig;
  readonly plugins?: readonly Plugin[];
}

export interface CompiledSizeLimits {
  readonly maxBodyBytes: number | undefined;
  readonly maxHeaderBytes: number;
  readonly maxHeaderCount: number;
  readonly maxUrlLength: number;
}

export interface CompiledRateLimitConfig {
  readonly limit: number;
  readonly windowMs: number;
  readonly algorithm: "sliding-window" | "token-bucket";
  readonly keyBy: "ip" | "apiKey" | "ip+apiKey" | ((ctx: SecureKitContext) => string);
  readonly isAsync: boolean;
}

export interface CompiledConfig {
  readonly steps: ReadonlyArray<import("./step.js").PipelineStep>;
  readonly headerBlocks: ReadonlyMap<string, string>;
  readonly corsOriginSet: ReadonlySet<string> | undefined;
  readonly corsOriginMatcher: CorsOriginMatcher | undefined;
  readonly rateLimit: CompiledRateLimitConfig | undefined;
  readonly sizeLimits: CompiledSizeLimits;
  readonly raw: Readonly<SecureKitConfig>;
}

export interface CompiledSecureKit {
  handle(ctx: import("./context.js").SecureKitContext): Promise<import("./step.js").StepResult>;
  readonly config: CompiledConfig;
  on<TEvent extends import("../observability/events.js").SecureKitEvent>(
    event: TEvent,
    handler: (
      payload: import("../observability/events.js").SecureKitEventPayload[TEvent],
    ) => void,
  ): void;
  destroy(): void;
}
