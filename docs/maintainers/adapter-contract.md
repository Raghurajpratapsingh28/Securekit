# Adapter contract

Framework adapters translate between HTTP framework types and the framework-agnostic core. Security behavior lives **only** in `securekit`.

## Data flow

```
Framework Request
  — adapter.to*Context()     // build SecureKitContext
  — kit.handle(ctx)          // compiled pipeline
  — mergeResponseHeaders()   // merge ctx.responseHeaders
  — adapter.apply*Result()   // map StepResult to framework response
```

## Adapter responsibilities

| Responsibility | Adapter | Core |
| --- | --- | --- |
| Parse framework headers into `ReadonlyHeaderMap` | Yes | No |
| Set `remoteAddress` from trusted source | Yes | No |
| Expose request body stream when applicable | Yes | No |
| Apply security decisions | No | Yes |
| Rate limit, CORS, auth logic | No | Yes |
| Write response status/headers/body | Yes (from StepResult) | No |
| Attach `securekit` state to framework req | Yes | Provides `ctx.state` |

## FrameworkAdapterContract

```typescript
interface FrameworkAdapterContract<Req, Res> {
  toContext(req: Req, res: Res): SecureKitContext;
  applyResult(res: Res, result: StepResult): void;
}
```

Express implements this via `toExpressContext` + `applyExpressResult`. Fastify via `toFastifyContext` + `applyFastifyResult`.

## Adding a new adapter

1. Create `packages/<framework>/` with peer dependency on framework
2. Depend on `@securekit/core` only (use `@securekit/core/internal` for context helpers)
3. Implement context translation — **do not** duplicate security checks
4. Map `continue` — `next()` / hook continuation; `respond` — short-circuit response
5. Add adapter tests mirroring `tests/adapters/parity.test.ts` scenarios
6. Document any framework-specific body/stream limitations

## Trusted proxy

Core rate limiting uses `ctx.remoteAddress`. Adapters **must not** blindly trust `X-Forwarded-For`. Operators behind load balancers should set `remoteAddress` from trusted proxy headers in adapter translation when needed.

## Parity verification

Run `tests/adapters/parity.test.ts` when changing adapter or core rejection behavior.
