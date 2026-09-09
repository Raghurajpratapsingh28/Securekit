# Architecture

SecureKit compiles configuration once at startup into a flat `PipelineStep[]` executed per request.

## Pipeline order (PRD ��10)

1. Structural validation (method, URL, header count/size) — **always active**
2. Content-Length guard — when `bodyLimit` is set
3. Rate limiting — when configured (before CORS to prevent preflight bypass)
4. CORS
5. Streaming body guard — when `bodyLimit` is set
6. Security headers
7. Request ID
8. API key validation (+ early key extraction when `keyBy` uses API keys)
9. User plugins (compile-time only — no runtime plugin registry)

## Package boundaries

| Package | Role |
| --- | --- |
| `securekit` | Zero runtime deps; compiler + runner |
| `@securekit/express` / `@securekit/fastify` | Thin adapters |
| `@securekit/redis` | Async `RedisStore` |
| `@securekit/context` | Opt-in ALS plugin |
| `@securekit/cli` | Static config audit (never in request path) |

Core never imports framework or Redis modules. Adapters translate framework request objects into `SecureKitContext` and apply `StepResult` responses.

## Public vs internal API

- **Public:** `securekit()`, config types, errors — see [modules/core.md](modules/core.md)
- **Internal:** compiler, `MemoryStore`, `Plugin`, adapter helpers — `@backend-master/securekit/internal`
- **Crypto:** `@backend-master/securekit/crypto` for tree-shakeable helpers

## Compile-time vs request-time

Unsafe configuration (wildcard CORS + credentials, missing `apiKey.validate`, invalid limits) fails at `securekit()` init with `ConfigurationError`. Per-request failures return typed errors (`CorsError`, `RateLimitError`, etc.) without leaking secrets.

## Observability (PRD ��31)

Opt-in synchronous hooks via `kit.on(event, handler)`. Listener arrays per event; when empty, the hot path pays a single length check only.

| Event | Payload |
| --- | --- |
| `rate-limit.rejected` | `{ key, limit, retryAfterMs }` |
| `cors.rejected` | `{ origin }` |
| `request-limit.rejected` | `{ limitType, limitBytes, actualBytes? }` |
| `api-key.rejected` | `{ reason }` |

No bundled metrics/tracing exporter. Event payloads never include raw API key material.
