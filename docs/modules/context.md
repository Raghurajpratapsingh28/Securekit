# @/context

## What it does

Opt-in `contextPlugin()` using Node `AsyncLocalStorage` for request-scoped access outside the handler.

## Performance impact

ALS has non-zero overhead; enable only when needed. Not on by default.

## Security tradeoffs

ALS does not bypass SecureKit checks — it only propagates context after the pipeline continues.

## Safe defaults

Do not register unless you need ALS-based logging/tracing.

## Production recommendations

Combine with explicit `requestId` for correlation IDs.

## Distributed limitations

ALS is per-process; not shared across workers.
