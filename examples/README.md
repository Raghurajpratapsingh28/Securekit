# Examples

Runnable examples that use the SecureKit v1.0 public API.

## Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

## Express

```bash
node examples/express-basic.mjs
```

The example configures security headers, CORS, body limits, and rate limiting with the Express adapter.

## Audit CLI

```bash
node packages/cli/dist/cli.js audit \
  --inline '{"headers":true,"bodyLimit":"1mb","rateLimit":{"limit":100,"window":60000}}'
```

Add `--json` for machine-readable output in CI pipelines.

## Production note

In-memory rate limits apply per process. For deployments behind a load balancer, use `@/redis`. See [docs/load-balancer.md](../docs/load-balancer.md).
