# securekit

## What it does

Zero-runtime-dependency security middleware compiler and pipeline runner for Node.js HTTP APIs.

## Performance impact

Hot path is a flat async step array with precompiled matchers. See [benchmark-report.md](../benchmark-report.md). Target: —5% p50/p99 overhead vs bare `node:http` for full config.

## Security tradeoffs

- Fail-closed per request; config fails at init
- No runtime plugin registry — plugins compiled into steps
- API keys hashed before constant-time compare
- CORS rejects unknown origins without reflecting attacker input

## Safe defaults

`headers: true`, sliding-window rate limit when configured, header-based API key extraction.

## Production recommendations

Use `@securekit/redis` for shared rate limits. Set `bodyLimit`. Use explicit CORS origins.

## Distributed limitations

Default `MemoryStore` is per-process. See [load-balancer.md](../load-balancer.md).

## Observability (PRD ��31)

Opt-in hooks via `kit.on()` — zero cost when no listeners registered:

```typescript
kit.on("rate-limit.rejected", ({ key, limit, retryAfterMs }) => { /* metrics */ });
kit.on("cors.rejected", ({ origin }) => { /* ... */ });
kit.on("request-limit.rejected", ({ limitType, limitBytes, actualBytes }) => { /* ... */ });
kit.on("api-key.rejected", ({ reason }) => { /* ... */ });
```

No bundled exporter; no logging dependency. Event payloads never include raw API key strings.

## Public API (v1.0)

```typescript
import { securekit, ConfigurationError, CorsError } from "@securekit/core";
import { hash, safeCompare } from "@securekit/core/crypto";
```

Runtime exports: `securekit`, six error classes. Types: `SecureKitConfig`, `CompiledSecureKit`, config sub-types.

Internal (`@securekit/core/internal`): `MemoryStore`, `Plugin`, compiler, adapter helpers — **unstable**.
