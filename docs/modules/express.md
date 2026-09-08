# @/express

## What it does

Express middleware adapter — translates `req`/`res` to `SecureKitContext` and applies pipeline results.

## Performance impact

One context allocation per request; header map built from Express headers. Overhead dominated by core pipeline — see benchmarks.

## Security tradeoffs

Uses `req.originalUrl || req.url` for path validation. Does not auto-trust proxy headers for IP.

## Safe defaults

Use as first middleware: `app.use(expressAdapter(()))`.

## Production recommendations

Set `trust proxy` in Express separately if needed; wire trusted IP into SecureKit via custom context if using IP rate limits.

## Distributed limitations

Same as core MemoryStore — use Redis store for multi-instance.

## Compatibility

Peer: `express ^4.21.0 || ^5.0.0`
