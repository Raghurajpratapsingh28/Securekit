# SecureKit
[![npm downloads](https://img.shields.io/npm/dt/@backend-master/securekit.svg?style=flat-square)](https://www.npmjs.com/package/@backend-master/securekit)
A zero-runtime-dependency security toolkit for Node.js HTTP APIs.

SecureKit combines security headers, CORS, rate limiting, request-size limits, API-key authentication, and request IDs in a single compile-time pipeline. Configuration is validated once at startup and compiled into a flat step array—disabled modules add no per-request overhead.

`@backend-master/securekit` has no npm runtime dependencies; it uses only Node.js built-ins.

## Requirements

- Node.js — 18

## Installation

```bash
pnpm add @backend-master/securekit @securekit/express
# Optional: @securekit/fastify @securekit/redis @securekit/context @securekit/cli
```

## Quick start

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
  apiKey: {
    validate: async (key) => (key === process.env.API_KEY ? { id: "app" } : null),
  },
});

const app = express();
app.use(expressAdapter(kit));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(3000);
```

See [`examples/express-basic.mjs`](examples/express-basic.mjs) for a runnable example.

**Load-balanced deployments:** the default in-memory rate limiter is per process. Use [`@securekit/redis`](docs/modules/redis.md) or the [load-balancer guide](docs/load-balancer.md) for shared limits across instances.

## Packages

| Package | Description |
| --- | --- |
| [`@backend-master/securekit`](docs/modules/core.md) | Compiler and security pipeline (zero runtime dependencies) |
| [`@securekit/express`](docs/modules/express.md) | Express middleware adapter |
| [`@securekit/fastify`](docs/modules/fastify.md) | Fastify plugin adapter |
| [`@securekit/redis`](docs/modules/redis.md) | Redis-backed rate-limit store |
| [`@securekit/context`](docs/modules/context.md) | Optional AsyncLocalStorage context plugin |
| [`@securekit/cli`](docs/modules/cli.md) | Static configuration audit tool |

Additional entry points:

- `@backend-master/securekit/crypto` — `safeCompare`, `hash`, `hmac`, token and request ID helpers
- `@backend-master/securekit/internal` — adapter and plugin contracts (unstable; no semver guarantee)

## Pre-deployment audit

```bash
npx securekit audit --config ./securekit.config.json
```

JSON output for CI:

```bash
npx securekit audit --inline '{"headers":true,"rateLimit":{"limit":100,"window":60000}}' --json
```

## Documentation

| Topic | Document |
| --- | --- |
| Configuration | [docs/configuration.md](docs/configuration.md) |
| Architecture | [docs/architecture.md](docs/architecture.md) |
| Load balancers and proxies | [docs/load-balancer.md](docs/load-balancer.md) |
| Compatibility | [docs/compatibility.md](docs/compatibility.md) |
| Full documentation index | [docs/README.md](docs/README.md) |

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm verify:release
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor guidelines and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

MIT — see [LICENSE](LICENSE).
