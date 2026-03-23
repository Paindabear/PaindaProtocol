# 🐼 @painda/chat

**High-level room and direct messaging management for PaindaProtocol.**

`@painda/chat` simplifies the creation of real-time communication features like global rooms, selective broadcasting, and direct messaging between clients. It is optimized for both simple chat apps and complex multiplayer lobbies.

### ⚡ Highlights

- **Room Management**: Easy join/leave logic with automatic cleanup on disconnect.
- **Selective Broadcasting**: Send messages to entire rooms with an optional sender exclusion.
- **Direct Messaging**: One-to-one communication between clients by ID.
- **Scalability Ready**: Designed to work seamlessly with Painda's Redis Adapters for horizontal scaling.

## Installation

```bash
npm install @painda/chat @painda/core
```

## Quick Start

```typescript
import { PPServer } from '@painda/core';
import { RoomManager, directMessage } from '@painda/chat';

const server = new PPServer({ port: 3000 });
const rooms = new RoomManager(server);

server.on('connection', (client) => {
  // Join a room
  rooms.join(client, 'general');

  client.on('message', (msg) => {
    if (msg.type === 'chat') {
      // Broadcast to room
      rooms.broadcast('general', {
        type: 'chat',
        payload: msg.payload,
      }, client); // exclude sender
    }

    if (msg.type === 'dm') {
      // Direct message to another client
      directMessage(server, msg.payload.to, {
        type: 'dm',
        payload: msg.payload.text,
      });
    }
  });
});
```

## API

### `RoomManager`
- `join(client, room)` — add client to room
- `leave(client, room)` — remove client from room
- `broadcast(room, message, exclude?)` — send to all in room

### `directMessage(server, targetId, message)`
Send a message directly to a specific client by ID.

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
