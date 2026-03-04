# @painda/persistence

**Database bridging middleware** for PaindaProtocol.

Automatically persists real-time messages to your database with batching and metrics.

Part of the [PaindaProtocol](https://pp.painda.tools) ecosystem.

## Installation

```bash
npm install @painda/persistence @painda/core
```

## Quick Start

```typescript
import { PPServer } from '@painda/core';
import { PPPersistenceMiddleware } from '@painda/persistence';

const server = new PPServer({ port: 3000 });

const persistence = new PPPersistenceMiddleware(server, {
  adapter: {
    async saveMessage(type, payload, context) {
      await db.messages.insert({ type, payload, ...context });
    },
    async loadState(roomId) {
      return db.rooms.findOne({ id: roomId });
    },
  },
  syncTypes: ['chat-message', 'game-state'],
  batchSize: 10,       // buffer 10 messages before flush
  silentErrors: true,   // don't throw on DB errors
});

// Check metrics
setInterval(() => {
  console.log(persistence.getMetrics());
  // { messagesReceived: 150, messagesPersisted: 148, persistenceErrors: 2 }
}, 10000);
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `adapter` | required | `{ saveMessage, loadState }` |
| `syncTypes` | `['chat-message', 'game-state']` | Message types to persist |
| `batchSize` | `1` | Batch writes (1 = immediate) |
| `silentErrors` | `true` | Swallow DB errors |

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
