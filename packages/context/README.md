# @securekit/context

Optional AsyncLocalStorage context plugin for [SecureKit](https://github.com/securekit/securekit).

Exposes the active `SecureKitContext` within the same async continuation chain. Applications that do not register this plugin incur no `async_hooks` overhead.

## Installation

```bash
pnpm add securekit @securekit/context
```

## Usage

```typescript
import { securekit } from "@backend-master/securekit";
import { contextPlugin, getRequestContext } from "@securekit/context";

const kit = securekit({
  requestId: true,
  plugins: [contextPlugin()],
});

// Later in the same async chain:
const ctx = getRequestContext();
console.log(ctx?.state.requestId);
```

The plugin prepends a compile-time pipeline step that calls `AsyncLocalStorage.enterWith(ctx)`.

## Documentation

- [Module reference](../../docs/modules/context.md)
- [Configuration](../../docs/configuration.md)
