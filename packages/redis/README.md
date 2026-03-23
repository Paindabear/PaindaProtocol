# 🐼 @painda/redis

**Scalable Redis Adapter for PaindaProtocol.**

`@painda/redis` enables horizontal scaling for your PaindaProtocol infrastructure. By using Redis as a shared backplane, multiple server instances can communicate, broadcast to the same rooms, and track global presence across a distributed cluster.

### ⚡ Highlights

- **Horizontal Scaling**: Broadcast messages to clients across any number of server nodes.
- **Shared Rooms**: Synchronize typed room states and deltas across the entire cluster.
- **Global Presence**: Track who's online regardless of which server instance they are connected to.
- **High Performance**: Optimized Pub/Sub implementation with minimal latency overhead.

## Installation

```bash
npm install @painda/redis @painda/core
```

## Quick Start

```typescript
import { PPServer } from '@painda/core';
import { PPRedisAdapter } from '@painda/redis';

const server = new PPServer({
  port: 3000,
  adapter: new PPRedisAdapter({
    host: 'localhost',
    port: 6379,
    prefix: 'painda-app',
  }),
});
```

## License

**MIT License** — free for private projects, open-source, and community use.
