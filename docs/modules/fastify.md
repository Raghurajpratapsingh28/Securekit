# @/fastify

## What it does

Fastify plugin (via `fastify-plugin`) registering SecureKit on the root instance.

## Performance impact

Comparable to Express adapter; see benchmark report.

## Security tradeoffs

Encapsulation bypassed with `fastify-plugin` so security runs globally.

## Safe defaults

```typescript
await fastify.register(fastifyPlugin(()));
```

## Production recommendations

Register before route handlers. Configure CORS origins for browser APIs.

## Distributed limitations

Use `RedisStore` when horizontally scaled.

## Compatibility

Peer: `fastify ^4.28.0 || ^5.0.0`
