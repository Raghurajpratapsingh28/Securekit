# CLI — ` audit`

Static configuration analysis. **Not** a penetration test or vulnerability scanner.

## Install

```bash
pnpm add -D @/cli
# or
npx  audit --help
```

## Usage

```bash
 audit [--config ./.config.json] [--inline '{"headers":true}'] [--json]
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Pass — no warnings or failures |
| `1` | Pass with warnings (e.g. missing rate limit, CORS wildcard) |
| `2` | Fail — invalid config or critical security issue |

## Checks

| ID | Severity | Description |
| --- | --- | --- |
| `config-valid` | pass/fail | Configuration compiles |
| `headers-enabled` / `headers-disabled` | pass/warn | Security headers |
| `headers-incomplete` | warn | Missing recommended headers |
| `headers-hsts` | pass | HSTS configured |
| `request-limits-configured` / `request-limits-missing` | pass/warn | `bodyLimit` |
| `rate-limit-present` / `rate-limit-missing` | pass/warn | Rate limit configured |
| `rate-limit-weak` | fail | Effectively unlimited limit |
| `rate-limit-high` | warn | Very high throughput limit |
| `rate-limit-memorystore-scaled` | warn | MemoryStore + horizontal scale |
| `rate-limit-async-store` | pass | Redis/async store |
| `cors-not-configured` | warn | No CORS |
| `cors-wildcard-origin` | warn | `origins: "*"` |
| `cors-wildcard-credentials` | fail | Invalid combo (also compile error) |
| `cors-static-origins` / `cors-dynamic-origins` | pass | Explicit CORS |
| `api-key-not-configured` / `api-key-configured` | warn/pass | API key module |
| `api-key-custom-extract` | warn | Custom extractor |
| `plugins-registered` | pass | Compile-time plugins |
| `rate-limit-ip-keying-proxy` | warn | IP keying behind proxy |

## CI example

```yaml
- run: pnpm exec  audit --config .config.json --json > audit.json
- run: node -e "const r=require('./audit.json'); if(r.exitCode>1) process.exit(1)"
```

Secrets are never printed — only config key names and compiled summaries.

## Security score

Weighted pass/warn checks produce **Security Score: N/100**. Failures score 0 for that check.
