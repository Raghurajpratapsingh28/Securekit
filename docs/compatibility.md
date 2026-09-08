# Compatibility matrix

SecureKit v1.0 support commitments (PRD §29).

## Node.js

| Version | Status | CI |
| --- | --- | --- |
| **22.x** (current LTS) | Fully supported | Yes — primary dev target |
| **20.x** (previous LTS) | Fully supported | Yes — full test suite |
| **18.x** | Supported while Node maintenance window active | Yes — full test suite |
| **< 18** | Not supported | — |
| Experimental / nightly | Not supported | — |

All packages declare `"engines": { "node": ">=18" }`.

## Framework adapters

Peer dependency ranges are tested per adapter package:

| Adapter | Express peer | Fastify peer |
| --- | --- | --- |
| `@/express` | `^4.21.0 \|\| ^5.0.0` | — |
| `@/fastify` | — | `^4.28.0 \|\| ^5.0.0` |

Express 5.x and Fastify 5.x are supported via peer ranges; CI runs adapter tests against the devDependency versions pinned in each package.

## Unsupported combinations

| Combination | Reason |
| --- | --- |
| Node `< 18` | Uses modern `node:crypto`, `AsyncLocalStorage`, and ESM-only packages |
| SecureKit core + runtime npm deps | Violates zero-dependency guarantee — not supported |
| MemoryStore for cluster-wide limits | Per-process store; use `@/redis` instead |
| Untrusted `X-Forwarded-For` for rate-limit IP keys | Enables limit bypass — set `remoteAddress` from trusted proxy headers in adapters |
| CORS `origins: "*"` + `credentials: true` | Rejected at compile time (browser-incompatible) |

## Redis

`@/redis` requires a Redis-compatible server reachable at runtime. It is optional and not part of the zero-dependency core boundary.
