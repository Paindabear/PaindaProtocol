# 🐼 @painda/core

**The high-performance, protocol-first backbone for real-time applications.**

`@painda/core` is a modern, production-ready alternative to Socket.io. It eliminated the "JSON-tax" of real-time apps by using a zero-copy binary frame architecture, providing up to **10x higher throughput** and **70% lower overhead**.

### ⚡ Highlights

- **Zero-Copy Performance**: Native `DataView` encoding on the wire.
- **Protocol-First**: Built-around binary schemas and typed messages.
- **Plugin System**: Robust lifecycle hooks for easy extensibility.
- **Standard Features**: Presence, Namespaces, Middleware, and Connection Recovery included.

## Installation

```bash
npm install @painda/core
```

## Quick Start

### Server

```typescript
import { PPServer } from '@painda/core';

const server = new PPServer({
  port: 3000,
  recovery: true,
  presence: { syncInterval: 1000 },
});

server.on('connection', (client) => {
  client.on('message', (msg) => {
    console.log('Received:', msg);
    client.emit('hello', 'World');
  });
});
```

### Client

```typescript
import { PPClient } from '@painda/core';

const client = new PPClient({ url: 'ws://localhost:3000' });

client.once('open', () => {
  client.emit('greet', 'Hello');
});

client.on('message', (msg) => {
  console.log('Server says:', msg.payload);
});
```

## Features

| Feature | Description |
|---------|-------------|
| 🔩 Zero-Copy Binary Framing | Native `DataView` — no JSON overhead |
| 📡 Namespaces | `server.of("/admin")` — multiplex on one socket |
| ⚡ Middleware | `server.use()` — auth, validation, logging chains |
| 🤝 Acknowledgements | Request-response with configurable timeouts |
| 🔄 Connection Recovery | Missed messages replayed + rooms restored |
| 📈 Horizontal Scaling | `PPAdapter` interface for Redis/Postgres |
| 🧩 Plugin System | `server.register(plugin)` — lifecycle hooks |
| 🏠 Typed Rooms | Delta-synced rooms at 60 FPS |
| 👥 Presence | Built-in who's-online tracking |
| 🏷️ Connection Tags | `broadcastToTag("role", "admin")` |
| 🛡️ Security | Origin whitelist, IP rate-limiting, max payload |
| 📊 Live Metrics | `server.getStats()` — clients, rooms, uptime |

## Security Options

```typescript
const server = new PPServer({
  port: 3000,
  maxPayload: 1_048_576,           // 1 MB (default)
  maxDecompressedSize: 10_485_760, // 10 MB (default)
  allowedOrigins: ['https://myapp.com'],
  maxConnectionsPerIp: 50,
  recoverySecret: 'my-hmac-secret',
});
```

## Ecosystem

| Package | Description |
|---------|-------------|
| `@painda/gaming` | Delta Engine — binary state sync |
| `@painda/chat` | Rooms & direct messaging |
| `@painda/video` | WebRTC signaling |
| `@painda/auth` | Token-based auth middleware |
| `@painda/persistence` | Auto-persist to your DB |
| `@painda/testing` | Test utilities |

## API overview

- **Frame**: `encodeFrame`, `decodeFrame` (V2 header, optional compression & schema).
- **Server**: `PPServer`, `server.of("/ns")` (namespaces), `server.room(id, state, options)` (typed rooms), `server.presence`, middleware, rate limit, recovery, adapter, plugins.
- **Client**: `PPClient`, `client.emit(type, payload)`, `client.on("message"|"roomState"|"roomDelta"|"presence"|...)`, reconnect & ack options.
- **Schema**: `PPSchemaRegistry`, `register(type, { id, encode, decode })`, built-in serializers.

For a full public-API list and DX notes, see [docs/CORE_API_ANALYSIS.md](../../docs/CORE_API_ANALYSIS.md) in the repo.

## Links

- 📖 [Documentation](https://pp.painda.tools/docs)
- 🎮 [Live Demo](https://pp.painda.tools/demo)
- 📝 [GitHub](https://github.com/Paindabear/PaindaProtocol)

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
