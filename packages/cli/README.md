# @/cli

Static configuration audit tool for [SecureKit](https://github.com//).

Analyzes SecureKit configuration at build or deploy time. Does not run in the request path.

## Installation

```bash
pnpm add @/cli
```

## Usage

```bash
npx  audit --config ./.config.json
npx  audit --inline '{"headers":true,"rateLimit":{"limit":100,"window":60000}}' --json
```

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Pass |
| 1 | Warnings |
| 2 | Fail |

## Scope

Static configuration analysis only. This tool is not a penetration test, vulnerability scanner, or runtime monitor.

## Documentation

- [CLI reference](../../docs/cli.md)
- [Module reference](../../docs/modules/cli.md)
