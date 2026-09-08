# @securekit/fastify

Fastify plugin adapter for [SecureKit](https://github.com/securekit/securekit).

Translates Fastify `request` and `reply` to and from `SecureKitContext`. All security logic runs in `securekit`.

The plugin is wrapped with `fastify-plugin` so hooks apply to routes registered on the root instance after `app.register()`.

## Installation

```bash
pnpm add securekit @securekit/fastify fastify
```

## Usage

```typescript
import Fastify from "fastify";
import { securekit } from "@securekit/core";
import { fastifyPlugin } from "@securekit/fastify";

const kit = securekit({
  headers: true,
  cors: { origins: ["https://example.com"] },
  rateLimit: { limit: 100, window: 60_000 },
});

const app = Fastify();
await app.register(fastifyPlugin(kit));

app.get("/", async (request) => {
  return request.securekit?.requestId ?? "ok";
});
```

Call `kit.destroy()` on application shutdown to release store resources.

## Peer dependency

- `fastify` ^4.28.0 or ^5.0.0

## Documentation

- [Module reference](../../docs/modules/fastify.md)
- [Configuration](../../docs/configuration.md)
