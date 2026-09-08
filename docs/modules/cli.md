# @/cli

## What it does

` audit` — static analysis of SecureKit configuration for CI and pre-deploy checks.

## Performance impact

Dev-time only; zero request-path cost.

## Security tradeoffs

Never prints secrets. Cannot detect runtime misconfiguration (wrong env, proxy trust).

## Safe defaults

Run in CI with `--json`; fail on exit code `2`.

## Production recommendations

Pair with integration tests and load-balancer guide.

## Distributed limitations

Infers scale from env vars (Kubernetes, ECS, etc.) — heuristic warnings only.

See [cli.md](../cli.md).
