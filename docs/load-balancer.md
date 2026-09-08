# Load balancer and proxy deployment

## Per-instance rate limits (N× problem)

`MemoryStore` is **per SecureKit instance**. With N replicas behind a load balancer, an client can receive up to **N × limit** unless you use:

- A shared store (`@/redis` `RedisStore`), or
- Sticky sessions (not recommended for security limits alone)

The audit CLI warns when Kubernetes or common PaaS env vars suggest horizontal scaling with default MemoryStore.

## Trusted client IP

When `rateLimit.keyBy` is `"ip"` or `"ip+apiKey"`, the key uses `ctx.remoteAddress`. Adapters set this from `req.socket.remoteAddress` by default.

Behind a reverse proxy, **do not** trust client-supplied `X-Forwarded-For`. Configure your adapter or edge proxy to set `remoteAddress` from a **trusted** forwarded header (e.g. your load balancer's `X-Real-IP` after stripping untrusted hops).

## Production checklist

1. Use explicit CORS origins for browser clients
2. Set `bodyLimit` for all public APIs
3. Use `RedisStore` when running more than one instance
4. Run ` audit --json` in CI
5. Terminate TLS at the edge; enable HSTS only with `hsts.acknowledge: true`

See [compatibility.md](compatibility.md) for unsupported combinations.
