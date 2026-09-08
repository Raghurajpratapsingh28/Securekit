# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| < 1.0 | No |

Security fixes are released as patch versions on the latest 1.x line.

## Reporting a vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

Report privately to the maintainers with:

1. Description of the issue and impact
2. Steps to reproduce (minimal PoC preferred)
3. Affected package(s) and version(s)
4. Any suggested fix (optional)

Include enough detail to reproduce without sharing production secrets. Do not paste real API keys, tokens, or customer data in reports.

We aim to acknowledge reports within a few business days. Critical issues in `securekit` (the request-path engine) receive highest priority.

## Security-sensitive areas

When reviewing or changing code, treat these as high sensitivity:

| Area | Risk |
| --- | --- |
| `securekit` pipeline | Authentication bypass, limit bypass, header injection |
| API key comparison (`api-key/compare.ts`, `crypto/safe-compare`) | Timing leaks, secret exposure |
| CORS origin matching | Origin reflection, credential leakage |
| Rate limit key derivation | Limit bypass via spoofed IP or key material |
| Configuration validation | Prototype pollution, type confusion |
| Error messages / CLI output | Secret or key material in logs |
| `securekit/internal` | Adapter mistakes affecting security behavior |

## Expectations for fixes

- Regressions receive automated tests in `tests/security/` or package unit tests
- `securekit` must remain zero-runtime-dependency
- Public API breaking changes require semver major and deprecation window
- Security fixes are backported to supported 1.x releases when practical

## Out of scope

SecureKit is not a WAF, DDoS mitigation service, or managed threat-intelligence platform. Operators remain responsible for network-level protection, TLS termination, secret rotation, and trusted proxy configuration.

See [docs/load-balancer.md](docs/load-balancer.md) for rate limiting behind load balancers.
