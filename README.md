<div align="center">
  <h1>🐼 PaindaProtocol (PP)</h1>
  <p><strong>Binary Speed. Typed Power. Plugin Ecosystem.</strong></p>
  <p>The high-performance, protocol-first backbone for real-time applications.</p>
  <p>
    <a href="https://pp.painda.tools/docs"><strong>📖 Documentation</strong></a> ·
    <a href="https://pp.painda.tools/demo"><strong>🎮 Live Demo</strong></a> ·
    <a href="https://pp.painda.tools/test"><strong>🧪 Benchmarks</strong></a>
  </p>
</div>

<br />

**PaindaProtocol (PP)** is a high-performance, protocol-first alternative to Socket.io. It eliminates the "JSON-tax" of real-time apps by using a zero-copy binary frame architecture, delivering up to **10x higher throughput** and **70% lower overhead**.

### 💡 Why PaindaProtocol?

- **"Socket.io was too slow"**: If your server struggles with 1000+ players or high-frequency updates, PP's binary engine is the answer.
- **"I need typed state sync"**: Built-in **Typed Rooms** and the **Delta Engine** handle state synchronization with automatic binary diffs.
- **"I want clean, modern DX"**: Native support for **Presence**, **Middleware**, **Acknowledgemts**, and a robust **Plugin System**.
- **🤖 AI-Ready**: Optimized for AI context ingestion with a consolidated `/llms.txt` specification.

---

## 🔥 Features

| Feature | Description |
|---------|-------------|
| 🔩 **Zero-Copy Binary Framing** | Native `DataView` encoding — no JSON overhead on the wire |
| 📡 **Namespaces** | `server.of("/admin")` — multiplex over a single WebSocket |
| ⚡ **Middleware Pipeline** | `server.use()` chains for auth, validation, logging |
| 🤝 **Acknowledgements** | `client.send(msg, callback)` — request-response with timeouts |
| 🔄 **Connection Recovery** | Missed messages replayed + rooms restored after reconnect |
| 📈 **Horizontal Scaling** | `PPAdapter` interface for Redis/Postgres multi-instance |
| 🧩 **Plugin System** | `server.register(plugin)` — extend core with lifecycle hooks |
| 🏠 **Typed Rooms** | `server.room<T>(id, state)` — delta-synced rooms at 60 FPS |
| 👥 **Presence** | `server.presence.track(socket, data)` — who's online |
| 🏷️ **Connection Tagging** | `client.setTag("role", "admin")` → `broadcastToTag()` |
| 🔑 **Token Refresh** | `getToken()` callback on every reconnect |
| 🎮 **Delta Engine** | State sync via diffs — 100x smaller payloads at 60 FPS |
| 🤖 **Virtual Clients** | `server.inject(bot)` — Headless in-memory connections for AI & tests |
| 🔇 **Volatile Messages** | Drop instead of queue for ephemeral data |
| 👂 **Catch-All Listeners** | `onAny()` for debugging and metrics |
| �️ **Deflate Compression** | Flag-based auto-compression on the wire |
| 📦 **Mixed Binary** | JSON + binary attachments in a single message |
| 🌐 **HTTP Fallback** | Long-polling transport for restrictive networks |
| ❤️ **Heartbeat** | Ping/pong with zombie connection cleanup |
| 🧪 **Testing Utils** | `createTestEnv()`, `waitForMessage()`, `collectMessages()` |

---

## 📦 Packages

| Package | Description | Version |
|---------|-------------|---------|
| [`@painda/core`](https://www.npmjs.com/package/@painda/core) | Binary engine, Server, Namespaces, Middleware, Plugins, Rooms, Presence | [![npm](https://img.shields.io/npm/v/@painda/core)](https://www.npmjs.com/package/@painda/core) |
| [`@painda/client`](https://www.npmjs.com/package/@painda/client) | Universal browser client with binary schema support & React hooks | [![npm](https://img.shields.io/npm/v/@painda/client)](https://www.npmjs.com/package/@painda/client) |
| [`@painda/gaming`](https://www.npmjs.com/package/@painda/gaming) | Delta Engine — high-frequency state sync with binary diffs | [![npm](https://img.shields.io/npm/v/@painda/gaming)](https://www.npmjs.com/package/@painda/gaming) |
| [`@painda/chat`](https://www.npmjs.com/package/@painda/chat) | Rooms, direct messages, and broadcasting utilities | [![npm](https://img.shields.io/npm/v/@painda/chat)](https://www.npmjs.com/package/@painda/chat) |
| [`@painda/admin`](https://www.npmjs.com/package/@painda/admin) | Real-time monitoring and management dashboard | [![npm](https://img.shields.io/npm/v/@painda/admin)](https://www.npmjs.com/package/@painda/admin) |
| [`@painda/redis`](https://www.npmjs.com/package/@painda/redis) | Horizontal scaling adapter for distributed clusters | [![npm](https://img.shields.io/npm/v/@painda/redis)](https://www.npmjs.com/package/@painda/redis) |
| [`@painda/video`](https://www.npmjs.com/package/@painda/video) | WebRTC signaling for low-latency P2P calls | [![npm](https://img.shields.io/npm/v/@painda/video)](https://www.npmjs.com/package/@painda/video) |
| [`@painda/auth`](https://www.npmjs.com/package/@painda/auth) | Token-based authentication middleware | [![npm](https://img.shields.io/npm/v/@painda/auth)](https://www.npmjs.com/package/@painda/auth) |
| [`@painda/testing`](https://www.npmjs.com/package/@painda/testing) | Comprehensive test utilities for PP applications | [![npm](https://img.shields.io/npm/v/@painda/testing)](https://www.npmjs.com/package/@painda/testing) |
| [`@painda/persistence`](https://www.npmjs.com/package/@painda/persistence) | Auto-persist messages to your DB with metrics | [![npm](https://img.shields.io/npm/v/@painda/persistence)](https://www.npmjs.com/package/@painda/persistence) |

---

## 🌐 Multi-Language Support (Roadmap)

We are currently expanding PaindaProtocol beyond the Node.js ecosystem. Our goal is to provide high-performance, native clients for modern high-performance stacks.

- **🐍 Python (Beta)**: Asynchronous client for AI integration, data science, and backend services.
- **🎮 C# (Coming Soon)**: Optimized for **Unity** and **Godot** with `Span<T>` and zero-copy semantics.
- **⚡ C++ (Coming Soon)**: Ultra-low latency core SDK for embedded systems and performance-critical clusters.

*Interested in early access? Follow the [Protocol Specification](docs/protocol/WIRE_FORMAT_SPEC.md) or contribute on GitHub.*

---

---

## 🚀 Quick Start

### 1. Installation
```bash
npm install @painda/core
```

### 2. Server with Plugins, Rooms & Presence
```typescript
import { PPServer, type PPPlugin } from "@painda/core";

const server = new PPServer({
  port: 3000,
  recovery: true,
  presence: { syncInterval: 1000 },
});

// Plugin system — extend core
const rateLimiter: PPPlugin<{ maxPerSec: number }> = {
  name: "rate-limiter",
  version: "1.0.0",
  install(ctx, options) {
    const counters = new Map<string, number>();
    return {
      onMessage(socket, msg) {
        const count = (counters.get(socket.id) ?? 0) + 1;
        counters.set(socket.id, count);
        if (count > (options?.maxPerSec ?? 100)) return false; // Block
      },
    };
  },
};
server.register(rateLimiter, { maxPerSec: 50 });

// Typed rooms — auto delta sync at 60 FPS
interface GameState { phase: string; score: Record<string, number> }
const lobby = server.room<GameState>("lobby-1", {
  phase: "waiting",
  score: {},
});

server.on("connection", (client) => {
  // Tag for grouping
  client.setTag("role", "player");

  // Presence tracking
  server.presence.track(client, { name: "Player", status: "online" });

  // Join typed room — full state auto-synced
  lobby.join(client);

  // Update room state — delta auto-broadcast
  lobby.update(s => {
    s.score[client.id] = 0;
  });
});
```

### 3. Client with Token Refresh & Room Sync
```typescript
import { PPClient } from "@painda/client";

const client = new PPClient({
  url: "ws://localhost:3000",
  reconnect: true,
  ackTimeout: 5000,
  getToken: async () => {
    // Called on every reconnect — fresh token each time
    return await refreshAuthToken();
  },
});

// Typed room state (full sync on join)
client.on("roomState", ({ room, state }) => {
  console.log(`Room ${room}:`, state);
});

// Typed room deltas (60 FPS updates)
client.on("roomDelta", ({ room, delta }) => {
  applyDelta(localState, delta);
});

// Presence
client.on("presence", ({ presences }) => {
  updateOnlineList(presences);
});

// Ack callback
client.send(
  { type: "save", payload: data },
  (err, response) => {
    if (err) console.error("Timeout");
    else console.log("Saved:", response);
  }
);
```

---

## 🧩 Plugin System

Plugins get full access to the server lifecycle and can extend core functionality. The community can build custom extensions without forking.

```typescript
const analytics: PPPlugin = {
  name: "analytics",
  version: "1.0.0",
  install(ctx) {
    // Full access to server internals
    ctx.use((socket, next) => {
      ctx.log("Client connected:", socket.id);
      next();
    });

    // Expose public API for other plugins
    ctx.expose({
      getStats: () => ({ clients: ctx.getClientCount() }),
    });

    return {
      onConnect: (socket) => trackConnection(socket),
      onDisconnect: (socket) => trackDisconnection(socket),
      onMessage: (socket, msg) => trackMessage(msg.type),
      onShutdown: () => flushMetrics(),
    };
  },
};

// Use in another plugin
const dashboard: PPPlugin = {
  name: "dashboard",
  version: "1.0.0",
  dependencies: ["analytics"], // Must be registered first
  install(ctx) {
    const analytics = ctx.getPlugin<{ getStats: () => object }>("analytics");
    // Use analytics.getStats() ...
  },
};
```

**Plugin Lifecycle Hooks:**
- `onConnect` / `onDisconnect` — client lifecycle
- `onMessage` — intercept/block incoming messages
- `onSend` — transform outgoing messages
- `onRoomJoin` / `onRoomLeave` — room events
- `onShutdown` — cleanup on server stop
- `onError` — error handling

---

## 📈 Benchmarks

| Metric | PaindaProtocol (PP) | Socket.io | Raw WS |
|---|---|---|---|
| **Latency (Median)** | **~37 ms** | ~41 ms | ~44 ms |
| **Throughput (msg/s)** | **~30,400 msg/s** | ~100 msg/s | ~29,100 msg/s |

---

## ⚡ Socket.io+ Feature Comparison

| Feature | Socket.io | PP |
|---------|-----------|-----|
| Namespaces | ✅ | ✅ `server.of()` |
| Middleware | ✅ | ✅ `server.use()` |
| Acknowledgements | ✅ | ✅ With Timeout |
| Connection Recovery | ✅ | ✅ Full Replay + Rooms |
| Horizontal Scaling | ✅ | ✅ Adapter Interface |
| HTTP Fallback | ✅ | ✅ PollingTransport |
| Catch-All | ✅ | ✅ `onAny()` |
| Volatile | ✅ | ✅ `{ volatile: true }` |
| **Plugin System** | ❌ | ✅ Full Lifecycle Hooks |
| **Typed Rooms** | ❌ | ✅ Delta Sync @ 60 FPS |
| **Presence** | ❌ | ✅ Built-in |
| **Binary Protocol** | ❌ | ✅ Zero-Copy Native |
| **Delta Engine** | ❌ | ✅ Gaming State Sync |
| **Connection Tags** | ❌ | ✅ `broadcastToTag()` |
| **Token Refresh** | ❌ | ✅ `getToken()` |
| **Testing Utils** | ❌ | ✅ `@painda/testing` |

---

## 🎮 The Delta Engine (`@painda/gaming`)

```typescript
import { StateManager } from "@painda/gaming";

const state = new StateManager({
  players: { p1: { x: 10, hp: 100 } },
});

state.update(s => { s.players.p1.hp = 90; });
const patch = state.getDelta();
// { players: { p1: { hp: 90 } } } → 100x smaller!
server.broadcast({ type: "delta", payload: patch });
```

---

## 🛡️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│  PPServer                                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Plugins  │ │Middleware│ │Namespace │ │  Handlers  │  │
│  │ Manager  │→│ Pipeline │→│ Router   │→│ + Acks     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│       ↕            ↕            ↕            ↕          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Typed    │ │ Presence │ │ Recovery │ │  Adapter   │  │
│  │ Rooms    │ │ System   │ │ Manager  │ │ (Redis)    │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
