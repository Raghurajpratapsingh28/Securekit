# Configuration reference

```typescript
import { securekit } from "@securekit/core";

const kit = securekit({
  headers: true,
  cors: { origins: ["https://app.example.com"] },
  bodyLimit: "1mb",
  requestId: true,
  rateLimit: { limit: 100, window: 60_000 },
  apiKey: {
    validate: async (key) => (isValid(key) ? { id: "key-1" } : null),
  },
});
```

## Safe defaults

| Option | Default | Notes |
| --- | --- | --- |
| `headers` | `true` | Disable only with explicit `headers: false` |
| `rateLimit.store` | in-process `MemoryStore` | Per-instance — see [load-balancer.md](load-balancer.md) |
| `rateLimit.algorithm` | `sliding-window` | See ADR-001 |
| `apiKey.extract` | `X-Api-Key` header | No query-string extractor shipped |

## Rate limiting

```typescript
rateLimit: {
  limit: 100,        // max requests per window
  window: 60_000,    // window in ms
  keyBy: "ip",       // "ip" | "apiKey" | "ip+apiKey" | (ctx) => string
  store: redisStore, // optional — defaults to MemoryStore
}
```

## CORS

Static allowlist recommended. Wildcard `origins: "*"` is allowed without credentials but flagged by the audit CLI.

## API keys

`validate` is required. Optional `keyHash` on returned metadata enables constant-time comparison via SHA-256 digest. Sensitive fields are stripped before attaching to `ctx.state.apiKey`.

## Plugins

Plugins register at compile time via `plugins: [contextPlugin()]`. No runtime plugin dispatch.

## Production usage

- Run `securekit audit` in CI before deploy ([cli.md](cli.md))
- Use `@securekit/redis` when running multiple instances ([load-balancer.md](load-balancer.md))
- Set trusted `remoteAddress` when behind a reverse proxy
- Call `kit.destroy()` on shutdown to release MemoryStore sweep timers
- Use `kit.on('rate-limit.rejected', —)` for observability — hooks are zero-cost when unused

## Errors

All configuration errors throw `ConfigurationError` at init with `field` and `suggestion` when available.
