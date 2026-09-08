export interface ReadonlyHeaderMap {
  get(name: string): string | undefined;
  has(name: string): boolean;
  /** Internal: approximate total header byte size for structural validation. */
  byteLength(): number;
  /** Internal: number of header fields. */
  count(): number;
}

export interface HeaderWriter {
  set(name: string, value: string): void;
  append(name: string, value: string): void;
}

export interface ApiKeyMetadata {
  readonly id: string;
  readonly keyHash?: string;
  readonly revoked?: boolean;
  readonly [key: string]: unknown;
}

export interface RateLimitState {
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
}

export interface SecureKitState {
  requestId: string | undefined;
  rateLimit: RateLimitState | undefined;
  apiKey: ApiKeyMetadata | undefined;
  /** SHA-256 hex digest of the presented API key for rate-limit keying (never the raw key). */
  rateLimitKeyMaterial: string | undefined;
  /** Byte-counted body stream installed by request-size module. */
  monitoredBody: AsyncIterable<Buffer> | undefined;
}

export interface SecureKitContextInit {
  readonly method: string;
  readonly url: string;
  readonly headers: ReadonlyHeaderMap;
  readonly remoteAddress?: string | undefined;
  readonly body?: AsyncIterable<Buffer> | undefined;
}

export interface SecureKitContext {
  readonly method: string;
  readonly url: string;
  readonly headers: ReadonlyHeaderMap;
  readonly remoteAddress: string | undefined;
  readonly body: AsyncIterable<Buffer> | undefined;
  responseHeaders: HeaderWriter;
  state: SecureKitState;
}
