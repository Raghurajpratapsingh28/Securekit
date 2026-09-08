# SecureKit documentation

Documentation for SecureKit v1.0. The product specification is available as `SecureKit-PRD.docx` at the repository root.

## Guides

| Document | Description |
| --- | --- |
| [Architecture](architecture.md) | Compile-time pipeline, package boundaries, request lifecycle |
| [Configuration](configuration.md) | `SecureKitConfig` reference and safe defaults |
| [Compatibility](compatibility.md) | Supported Node.js and framework versions |
| [Deprecation policy](deprecation-policy.md) | Semver rules and `securekit/internal` stability |
| [Load balancer / proxy](load-balancer.md) | Trusted IP forwarding and distributed rate limits |
| [CLI audit tool](cli.md) | `securekit audit` usage and CI integration |
| [Benchmark report](benchmark-report.md) | Methodology and measured results |
| [PRD compliance matrix](prd-compliance-matrix.md) | Requirement traceability |
| [Maintainer guide](maintainers/README.md) | Architecture constraints, testing, and releases |
| [Maintainer handoff](HANDOFF.md) | Current state, guarantees, and known limitations |
| [Security policy](../SECURITY.md) | Vulnerability reporting |
| [Contributing](../CONTRIBUTING.md) | Contributor workflow |
| [Changelog](../CHANGELOG.md) | Release notes |

## Module reference

Each module document covers purpose, performance characteristics, security tradeoffs, safe defaults, production recommendations, and distributed deployment notes.

| Package | Document |
| --- | --- |
| `securekit` | [modules/core.md](modules/core.md) |
| `@securekit/express` | [modules/express.md](modules/express.md) |
| `@securekit/fastify` | [modules/fastify.md](modules/fastify.md) |
| `@securekit/redis` | [modules/redis.md](modules/redis.md) |
| `@securekit/context` | [modules/context.md](modules/context.md) |
| `@securekit/cli` | [modules/cli.md](modules/cli.md) |

## Architecture decision records

| ADR | Topic |
| --- | --- |
| [001](decisions/001-sliding-window-default.md) | Sliding-window vs token-bucket default |
| [002](decisions/002-memorystore-capacity.md) | `maxStoreEntries` default |
| [003](decisions/003-api-key-extraction.md) | Header-only default extractor |
| [004](decisions/004-cli-json-output.md) | JSON audit output for CI |
| [005](decisions/005-adapter-utils.md) | No shared adapter-utils package |

## Examples

Runnable examples are in [`../examples/`](../examples/).
