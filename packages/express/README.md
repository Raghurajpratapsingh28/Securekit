# @securekit/express

Express middleware adapter for [SecureKit](https://github.com/securekit/securekit).

Translates Express `Request` and `Response` objects to and from `SecureKitContext`. All security logic runs in `securekit`.

## Installation

```bash
pnpm add securekit @securekit/express express
```

## Usage

```typescript
import express from "express";
import { securekit } from "securekit";
import { expressAdapter } from "@securekit/express";

const kit = securekit({
  headers: true,
  cors: { origins: ["https://example.com"] },
  rateLimit: { limit: 100, window: 60_000 },
});

const app = express();
app.use(expressAdapter(kit));

app.get("/", (req, res) => {
  res.send(req.securekit?.requestId ?? "ok");
});
```

Call `kit.destroy()` on application shutdown to release store resources.

## Peer dependency

- `express` ^4.21.0 or ^5.0.0

## Documentation

- [Module reference](../../docs/modules/express.md)
- [Configuration](../../docs/configuration.md)
