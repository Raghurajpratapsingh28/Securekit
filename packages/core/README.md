# @backend-master/securekit

**A zero-runtime-dependency security engine for Node.js HTTP APIs.**

SecureKit combines security headers, CORS, request-size limits, rate limiting, request IDs, and API-key authentication in one compile-time pipeline. You configure it once at startup; SecureKit validates that configuration, compiles it into a flat step array, and runs those steps on every request. Disabled modules add no per-request cost.

This document is the primary reference for the `@backend-master/securekit` npm package. It is written so you can install, configure, integrate, deploy, and operate SecureKit without reading the source code first.

---

## Table of contents

1. [Overview](#overview)
2. [Before you begin](#before-you-begin)
3. [How SecureKit works](#how-securekit-works)
4. [Get started](#get-started)
5. [Configure SecureKit](#configure-securekit)
6. [Integrate with your framework](#integrate-with-your-framework)
7. [Deploy behind a load balancer](#deploy-behind-a-load-balancer)
8. [Monitor requests](#monitor-requests)
9. [Understand errors](#understand-errors)
10. [Use cryptographic helpers](#use-cryptographic-helpers)
11. [Extend with plugins](#extend-with-plugins)
12. [Validate configuration in CI](#validate-configuration-in-ci)
13. [Package exports](#package-exports)
14. [Related packages](#related-packages)
15. [Compatibility](#compatibility)
16. [Troubleshooting](#troubleshooting)
17. [Security](#security)
18. [TypeScript and module format](#typescript-and-module-format)
19. [License](#license)

---

## Overview

Most Node.js APIs assemble security from separate middleware packages—headers, CORS, rate limits, body parsers, and auth—each with its own dependencies, defaults, and ordering rules. That approach creates three recurring problems:

1. **Supply-chain surface** — every middleware adds runtime dependencies on the request hot path.
2. **Ordering bugs** — security headers or CORS may be missing on error responses (429, 403, 401).
3. **Late failures** — invalid configuration is often discovered only when a request hits an edge case.

SecureKit addresses these by design:

| Concern | SecureKit behavior |
| --- | --- |
| Dependencies | `@backend-master/securekit` has **zero npm runtime dependencies** (Node.js built-ins only). |
| Configuration | Validated **at startup**; invalid config throws before you accept traffic. |
| Execution model | **Compile-time pipeline** — a prebuilt step array, not per-request middleware chaining. |
| Framework coupling | **Framework-agnostic core** with thin adapters for Express, Fastify, and raw `node:http`. |
| Secrets | Constant-time API-key comparison, prototype-pollution guards, redacted error payloads. |

---

## Before you begin

### Requirements

| Requirement | Details |
| --- | --- |
| **Node.js** | 18 or later (20.x and 22.x LTS recommended). |
| **Module system** | ESM (`import` / `export`). Packages use `"type": "module"`. |
| **TypeScript** | Optional. Types ship with the package. |

### What you should know

- SecureKit operates on an abstract **request context** (`SecureKitContext`). Framework adapters translate native request objects into that context.
- Security runs **before** your route handler. Adapters merge SecureKit response headers and status codes with your handler output.
- Call **`kit.destroy()`** when your process shuts down to release in-memory store timers.

---

## How SecureKit works

### Key terms

| Term | Definition |
| --- | --- |
| **Config** | The object you pass to `securekit({ ... })`. Describes which security modules are enabled and how they behave. |
| **Compile** | One-time validation and transformation of config into compiled artifacts (matchers, limits, step list). Happens inside `securekit()`. |
| **Pipeline** | Ordered list of async steps executed per request via `kit.handle(ctx)`. |
| **Context** | Per-request state: method, URL, headers, body stream, client address, and mutable response header writer. |
| **Adapter** | Framework bridge (e.g. `@securekit/express`) that builds context, calls `handle`, and applies results. |

### Lifecycle

```
startup:  securekit(config)  →  validate  →  compile  →  CompiledSecureKit
request:  adapter builds ctx  →  kit.handle(ctx)  →  continue | respond
shutdown: kit.destroy()  →  release MemoryStore sweep timers
```

**Important:** Configuration is frozen after compile. To change security settings, create a new kit instance (typically at deploy time, not per request).

---

## Get started

### Install the core package

```bash
npm install @backend-master/securekit
```

### Install an adapter (recommended)

For Express:

```bash
npm install @backend-master/securekit @securekit/express express
```

For Fastify:

```bash
npm install @backend-master/securekit @securekit/fastify fastify
```

### Minimal Express example

```typescript
import express from "express";
import { securekit } from "@backend-master/securekit";
import { expressAdapter } from "@securekit/express";

const kit = securekit({
  headers: true,
  cors: { origins: ["https://app.example.com"] },
  bodyLimit: "1mb",
  rateLimit: { limit: 100, window: 60_000 },
  requestId: true,
});

const app = express();
app.use(expressAdapter(kit));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    requestId: req.securekit?.requestId,
  });
});

const server = app.listen(3000);

process.on("SIGTERM", () => {
  kit.destroy();
  server.close();
});
```

### The compiled kit API

`securekit(config)` returns a **CompiledSecureKit** with:

| Member | Description |
| --- | --- |
| `handle(ctx)` | Run the pipeline for one request. Returns `continue` or a full HTTP response. |
| `config` | Read-only snapshot of compiled configuration. |
| `on(event, fn)` | Register observability listeners (optional; zero cost when unused). |
| `destroy()` | Release resources (call on process exit). |

---

## Configure SecureKit

Pass a single configuration object to `securekit()`. All top-level keys are optional.

### Top-level options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `headers` | `boolean \| HeadersConfig` | `true` | HTTP security headers |
| `cors` | `CorsConfig` | — | Cross-origin resource sharing; omit to disable |
| `bodyLimit` | `string \| number` | — | Maximum request body size |
| `rateLimit` | `RateLimitConfig` | — | Request rate limiting |
| `requestId` | `boolean \| RequestIdConfig` | — | Request ID generation or propagation |
| `apiKey` | `ApiKeyConfig` | — | API key extraction and validation |
| `plugins` | `Plugin[]` | — | Compile-time extensions (advanced) |

**Note:** Unknown keys and prototype-pollution keys (`__proto__`, `constructor`) are rejected at compile time with `ConfigurationError`, including a `field` path and suggestion when available.

---

### Security headers

Enable the recommended preset:

```typescript
headers: true
```

Or configure individual headers:

```typescript
headers: {
  xContentTypeOptions: true,
  xFrameOptions: "DENY",                    // "DENY" | "SAMEORIGIN"
  referrerPolicy: "strict-origin-when-cross-origin",
  permissionsPolicy: "camera=(), microphone=()",
  hsts: {
    maxAge: 31_536_000,
    includeSubDomains: true,
    preload: false,
    acknowledge: true,                      // required before enabling HSTS
  },
  csp: "default-src 'self'",
  cspReportOnly: undefined,
}
```

| Guidance | Detail |
| --- | --- |
| **Recommended default** | `headers: true` for public APIs. |
| **When to disable** | Only if a reverse proxy or CDN already sets equivalent headers and you accept responsibility for parity on error responses. |
| **HSTS** | Set `hsts.acknowledge: true` to confirm you terminate TLS at the edge. |

---

### CORS

```typescript
cors: {
  origins: ["https://app.example.com", "https://staging.example.com"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86_400,
  allowNullOrigin: false,
}
```

| Field | Description |
| --- | --- |
| `origins` | Static string allowlist (recommended), `"*"`, or `(origin) => boolean \| Promise<boolean>`. |
| `credentials` | Allow cookies and authorization headers cross-origin. Cannot combine with `origins: "*"` (compile error). |
| `methods` | Allowed HTTP methods for preflight. |
| `allowedHeaders` | Headers the browser may send. |
| `exposedHeaders` | Response headers visible to browser scripts. |
| `maxAge` | Preflight cache duration in seconds. |

**Behavior:**

- Disallowed origins receive **403** without reflecting attacker-controlled values.
- **OPTIONS** preflight requests traverse the full pipeline, including rate limits.

**Caution:** Wildcard `origins: "*"` is permitted without credentials but is flagged by the audit CLI in production configurations.

---

### Request and body limits

```typescript
bodyLimit: "1mb"       // human-readable: b, kb, mb, gb
bodyLimit: 1_048_576   // or exact byte count
```

SecureKit enforces:

| Limit | Behavior |
| --- | --- |
| Body size | Compares `Content-Length` before read; monitors streaming bodies. |
| URL length | Rejects oversized URLs. |
| Header count / size | Structural limits always apply. |

Violations return **413** (`RequestLimitError`).

**Note:** Set `bodyLimit` on all public APIs. The audit CLI warns when it is missing.

---

### Rate limiting

```typescript
rateLimit: {
  limit: 100,
  window: 60_000,
  algorithm: "sliding-window",   // default; or "token-bucket"
  keyBy: "ip",                   // "ip" | "apiKey" | "ip+apiKey" | (ctx) => string
  maxStoreEntries: 10_000,       // MemoryStore only
  store: undefined,              // defaults to in-process MemoryStore
}
```

| Field | Description |
| --- | --- |
| `limit` | Maximum requests allowed per window per key. |
| `window` | Window duration in milliseconds. |
| `algorithm` | `sliding-window` (default) or `token-bucket`. |
| `keyBy` | How to bucket requests. Custom functions receive `SecureKitContext`. |
| `store` | Optional `Store` implementation. Defaults to `MemoryStore`. |
| `maxStoreEntries` | Cap on in-memory keys before sweep evicts oldest entries. |

**Responses:** Limit exceeded → **429** with `Retry-After` when applicable.

**Important:** The default `MemoryStore` is **per Node.js process**. See [Deploy behind a load balancer](#deploy-behind-a-load-balancer).

**Caution:** `token-bucket` with async stores is rejected at compile time. Use `sliding-window` with Redis.

---

### Request ID

```typescript
requestId: true
```

Or:

```typescript
requestId: {
  header: "x-request-id",
  trustIncoming: false,
}
```

| Field | Description |
| --- | --- |
| `header` | Response header name (default: `x-request-id`). |
| `trustIncoming` | When `true`, reuse a valid incoming ID instead of generating a new one. |

Adapters expose the ID on the request object (e.g. `req.securekit.requestId` in Express).

---

### API keys

```typescript
apiKey: {
  extract: (ctx) => ctx.headers.get("x-api-key") ?? undefined,
  validate: async (key) => {
    const record = await db.findKey(key);
    if (!record) return null;
    return {
      id: record.id,
      keyHash: record.sha256Hex,
      revoked: record.revoked === true,
    };
  },
}
```

| Field | Description |
| --- | --- |
| `extract` | Returns raw key material from the request. Default: `X-Api-Key` header. |
| `validate` | **Required** when `apiKey` is set. Return metadata or `null` if invalid. |

**Security properties:**

- When `keyHash` is provided, comparison uses **constant-time** SHA-256 digest verification.
- Raw keys never appear in error bodies, logs from SecureKit events, or `ctx.state` beyond the compare step.
- Missing, invalid, or revoked keys → **401** (`AuthenticationError`).

**Note:** SecureKit does not ship a query-string extractor. Passing secrets in URLs is discouraged.

---

## Integrate with your framework

### Express (`@securekit/express`)

**Peer dependency:** `express` ^4.21.0 or ^5.0.0

```typescript
import express from "express";
import { securekit } from "@backend-master/securekit";
import { expressAdapter } from "@securekit/express";

const kit = securekit({ headers: true, rateLimit: { limit: 200, window: 60_000 } });
const app = express();

app.use(expressAdapter(kit));

app.get("/api/data", (req, res) => {
  res.json({ requestId: req.securekit?.requestId });
});
```

`req.securekit` contains `SecureKitState`: request ID, rate-limit metadata, API-key metadata (non-secret fields only), and related pipeline state.

---

### Fastify (`@securekit/fastify`)

**Peer dependency:** `fastify` ^4.28.0 or ^5.0.0

```typescript
import Fastify from "fastify";
import { securekit } from "@backend-master/securekit";
import { fastifyPlugin } from "@securekit/fastify";

const kit = securekit({
  headers: true,
  cors: { origins: ["https://app.example.com"] },
  bodyLimit: "512kb",
  rateLimit: { limit: 100, window: 60_000 },
});

const app = Fastify();
await app.register(fastifyPlugin(kit));

app.get("/health", async (request) => {
  return { ok: true, requestId: request.securekit?.requestId };
});

await app.listen({ port: 3000 });
```

---

### Raw `node:http`

Use a framework adapter when possible. For custom servers, follow this pattern:

1. Build a `SecureKitContext` from the incoming request (method, URL, headers, `remoteAddress`).
2. Call `await kit.handle(ctx)`.
3. If the result is `respond`, set status, headers, and body; return.
4. Otherwise merge `ctx` response headers and continue to your handler.

Adapter source in `@securekit/express` is the canonical reference implementation.

---

## Deploy behind a load balancer

### The N× rate-limit problem

`MemoryStore` counts requests **inside each process**. With **N** replicas behind a load balancer, a client can send up to **N × limit** requests per window unless you use a shared store.

| Deployment | Rate-limit store |
| --- | --- |
| Single Node process | Default `MemoryStore` is sufficient. |
| Multiple replicas (Kubernetes, ECS, PaaS) | Use `@securekit/redis` `RedisStore` or equivalent shared `Store`. |
| Sticky sessions only | Not recommended as the sole limit strategy. |

### Redis example

```bash
npm install @backend-master/securekit @securekit/redis redis
```

```typescript
import { createClient } from "redis";
import { securekit } from "@backend-master/securekit";
import { RedisStore, adaptRedisClient } from "@securekit/redis";

const client = createClient({ url: process.env.REDIS_URL });
await client.connect();

const kit = securekit({
  headers: true,
  bodyLimit: "1mb",
  rateLimit: {
    limit: 100,
    window: 60_000,
    store: new RedisStore(adaptRedisClient(client)),
  },
});
```

**Note:** `RedisStore.destroy()` does not close the Redis client. Manage connection lifecycle in your application.

### Trusted client IP

When `keyBy` is `"ip"` or `"ip+apiKey"`, the bucket key uses `ctx.remoteAddress`.

**Caution:** Do not trust client-supplied `X-Forwarded-For`. Configure your proxy or adapter so `remoteAddress` reflects the **trusted** hop (for example, your load balancer’s `X-Real-IP` after stripping untrusted values).

---

## Monitor requests

Register listeners with `kit.on()` only when you need metrics or structured logs. **There is no overhead when no listeners are attached.**

| Event | Payload (summary) | When fired |
| --- | --- | --- |
| `rate-limit.rejected` | `key`, `limit`, `retryAfterMs` | 429 would be returned |
| `cors.rejected` | `origin` | Origin not allowed |
| `request-limit.rejected` | `limitType`, `limitBytes`, `actualBytes` | Body/URL/header limit exceeded |
| `api-key.rejected` | `reason` | Authentication failure |

```typescript
kit.on("rate-limit.rejected", ({ key, limit, retryAfterMs }) => {
  metrics.increment("securekit_rate_limit_rejected", { key: hashKey(key) });
});

kit.on("api-key.rejected", ({ reason }) => {
  logger.info({ reason }, "api_key_rejected");
});
```

**Important:** Event payloads never include raw API key strings.

SecureKit does not bundle a logging or metrics exporter. You choose where events go.

---

## Understand errors

All runtime security errors extend `SecureKitError` with stable `code` and HTTP-oriented `statusCode`.

| Class | HTTP status | When |
| --- | --- | --- |
| `ConfigurationError` | — (thrown at init) | Invalid or unsafe configuration |
| `CorsError` | 403 | CORS policy violation |
| `RateLimitError` | 429 | Rate limit exceeded |
| `RequestLimitError` | 413 | Request too large |
| `AuthenticationError` | 401 | API key missing, invalid, or revoked |

```typescript
import {
  securekit,
  ConfigurationError,
  CorsError,
  RateLimitError,
  RequestLimitError,
  AuthenticationError,
  SecureKitError,
} from "@backend-master/securekit";
```

`ConfigurationError` includes:

- `field` — config path (e.g. `rateLimit.limit`)
- `received` — sanitized received value
- `suggestion` — human-readable fix hint when available

---

## Use cryptographic helpers

The `@backend-master/securekit/crypto` entry point provides zero-dependency helpers for your own auth and session code:

```typescript
import {
  safeCompare,
  hash,
  hmac,
  generateToken,
  generateRequestId,
} from "@backend-master/securekit/crypto";

safeCompare(a, b);              // timing-safe comparison
hash("sha256", data);           // hex-encoded digest
hmac("sha256", secret, data);   // hex-encoded HMAC
generateToken(32);              // cryptographically random hex string
generateRequestId();            // UUID-style identifier
```

These utilities share the same no-runtime-deps guarantee as the core package.

---

## Extend with plugins

Plugins extend the pipeline at **compile time**. There is no runtime plugin registry or dynamic loading.

```typescript
import { securekit, ConfigurationError } from "@backend-master/securekit";
import type { Plugin } from "@backend-master/securekit/internal";
import { CONTINUE } from "@backend-master/securekit/internal";

const requireApiKeyPlugin: Plugin = {
  name: "require-api-key-config",
  compile(_steps, config) {
    if (config.apiKey === undefined) {
      throw new ConfigurationError("This plugin requires apiKey in config", {
        field: "apiKey",
      });
    }
  },
};

const kit = securekit({
  headers: false,
  apiKey: { validate: myValidateFn },
  plugins: [requireApiKeyPlugin],
});
```

**Caution:** `@backend-master/securekit/internal` is intended for adapter and plugin authors. It is **not** covered by semver stability guarantees.

---

## Validate configuration in CI

Install the CLI package:

```bash
npm install --save-dev @securekit/cli
```

Run a static audit before deploy:

```bash
npx securekit audit --config ./securekit.config.json
npx securekit audit --inline '{"headers":true,"bodyLimit":"1mb"}' --json
```

| Exit code | Meaning |
| --- | --- |
| `0` | Pass — no warnings or failures |
| `1` | Pass with warnings (e.g. missing rate limit, wildcard CORS) |
| `2` | Fail — invalid config or critical issue |

The audit performs **static configuration analysis**. It is not a penetration test or vulnerability scanner.

Example GitHub Actions step:

```yaml
- name: SecureKit config audit
  run: |
    npx securekit audit --config securekit.config.json --json > audit.json
    node -e "const r=require('./audit.json'); if(r.exitCode>1) process.exit(1)"
```

Representative checks include: config validity, headers enabled, body limits present, rate limit strength, MemoryStore vs horizontal scale, CORS wildcard warnings, and API-key configuration.

---

## Package exports

| Import path | Stable | Purpose |
| --- | --- | --- |
| `securekit` | Yes | `securekit()`, config types, error classes |
| `@backend-master/securekit/crypto` | Yes | Cryptographic helpers |
| `@backend-master/securekit/internal` | **No** | Compiler, `MemoryStore`, adapter contracts, plugins |

Public runtime exports from `securekit`:

- **Function:** `securekit`
- **Errors:** `SecureKitError`, `ConfigurationError`, `CorsError`, `RateLimitError`, `RequestLimitError`, `AuthenticationError`
- **Types:** `SecureKitConfig`, `CompiledSecureKit`, and related config interfaces (TypeScript)

---

## Related packages

| Package | Install when you need |
| --- | --- |
| `@securekit/express` | Express middleware adapter |
| `@securekit/fastify` | Fastify plugin adapter |
| `@securekit/redis` | Shared rate-limit store for multiple instances |
| `@securekit/context` | AsyncLocalStorage-based request context propagation |
| `@securekit/cli` | `securekit audit` for CI and pre-deploy checks |

---

## Compatibility

### Node.js

| Version | Support |
| --- | --- |
| 22.x (current LTS) | Fully supported |
| 20.x (previous LTS) | Fully supported |
| 18.x | Supported while Node maintenance is active |
| &lt; 18 | Not supported |

### Framework peers

| Adapter | Peer dependency |
| --- | --- |
| `@securekit/express` | `express` ^4.21.0 or ^5.0.0 |
| `@securekit/fastify` | `fastify` ^4.28.0 or ^5.0.0 |
| `@securekit/redis` | `redis` ^4.7.0 or ^5.0.0 |

### Unsupported combinations

| Combination | Reason |
| --- | --- |
| Node &lt; 18 | Requires modern `node:crypto`, ESM, and related APIs |
| MemoryStore for cluster-wide limits | Per-process; use Redis store |
| Untrusted `X-Forwarded-For` for IP rate keys | Enables bypass; set trusted `remoteAddress` |
| `origins: "*"` + `credentials: true` | Rejected at compile time |

---

## Troubleshooting

### Rate limits seem ineffective with multiple pods

**Cause:** Default `MemoryStore` is per process.

**Fix:** Add `@securekit/redis` and pass a shared `store`. See [Deploy behind a load balancer](#deploy-behind-a-load-balancer).

---

### CORS works locally but fails in production

**Cause:** Origin not in allowlist, or preflight blocked by rate limit.

**Fix:** Add exact production origins (scheme + host + port). Ensure OPTIONS requests are not blocked upstream.

---

### `ConfigurationError` at startup

**Cause:** Invalid config shape, forbidden keys, or incompatible options.

**Fix:** Read `error.field` and `error.suggestion`. Run `npx securekit audit` for a structured report.

---

### API keys always return 401

**Cause:** Extractor not reading the header you send, or `validate` returning `null`.

**Fix:** Log only `reason` from `api-key.rejected` events (never log raw keys). Confirm `extract` matches your client and `keyHash` matches your stored digest.

---

### Memory grows over time with rate limiting

**Cause:** High cardinality of rate-limit keys with default MemoryStore.

**Fix:** Lower `maxStoreEntries`, use Redis with TTL-aligned keys, or narrow `keyBy`.

---

### Security headers missing on error responses

**Cause:** Handler or framework bypasses adapter merge path.

**Fix:** Ensure SecureKit adapter runs first and that early errors still flow through adapter response handling.

---

## Security

### Reporting vulnerabilities

Do **not** file public issues for security vulnerabilities. Report privately to the package maintainers with:

1. Description and impact
2. Steps to reproduce (minimal proof of concept)
3. Affected package and version
4. Optional suggested fix

See the project `SECURITY.md` for supported versions and response expectations.

### Secure defaults summary

| Area | Recommendation |
| --- | --- |
| Headers | Keep `headers: true` unless headers are guaranteed elsewhere |
| CORS | Use explicit origin allowlists in production |
| Body | Set `bodyLimit` on public endpoints |
| Rate limit | Configure limits; use Redis when horizontally scaled |
| API keys | Store hashes; use `keyHash` in validate results |
| Shutdown | Call `kit.destroy()` on SIGTERM |

---

## TypeScript and module format

- SecureKit is authored in TypeScript; declaration files ship in `dist/`.
- Import types from the same paths as runtime code: `SecureKitConfig`, `CompiledSecureKit`, etc.
- Packages are **ESM-only** (`"type": "module"`). Use `import` syntax or dynamic `import()` in CommonJS consumers.

---

## License

MIT
