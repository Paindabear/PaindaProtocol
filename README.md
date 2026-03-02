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

**PaindaProtocol (PP)** is a modern, production-ready alternative to Socket.io. It combines the blazing speed of raw WebSockets with a zero-copy binary frame architecture — plus every feature you know from Socket.io, and killer features like **Typed Rooms with Delta Sync**, **Presence**, and a **Plugin System** that Socket.io doesn't have.

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
| [`@painda/core`](https://www.npmjs.com/package/@painda/core) | Binary engine, Server, Client, Namespaces, Middleware, Plugins, Rooms, Presence | [![npm](https://img.shields.io/npm/v/@painda/core)](https://www.npmjs.com/package/@painda/core) |
| [`@painda/gaming`](https://www.npmjs.com/package/@painda/gaming) | Delta Engine — state sync with binary diffs | [![npm](https://img.shields.io/npm/v/@painda/gaming)](https://www.npmjs.com/package/@painda/gaming) |
| [`@painda/chat`](https://www.npmjs.com/package/@painda/chat) | Rooms, direct messages, broadcasting | [![npm](https://img.shields.io/npm/v/@painda/chat)](https://www.npmjs.com/package/@painda/chat) |
| [`@painda/video`](https://www.npmjs.com/package/@painda/video) | WebRTC signaling for low-latency P2P calls | [![npm](https://img.shields.io/npm/v/@painda/video)](https://www.npmjs.com/package/@painda/video) |
| [`@painda/auth`](https://www.npmjs.com/package/@painda/auth) | Token-based authentication middleware | [![npm](https://img.shields.io/npm/v/@painda/auth)](https://www.npmjs.com/package/@painda/auth) |
| [`@painda/persistence`](https://www.npmjs.com/package/@painda/persistence) | Auto-persist messages to your DB with metrics | [![npm](https://img.shields.io/npm/v/@painda/persistence)](https://www.npmjs.com/package/@painda/persistence) |
| [`@painda/testing`](https://www.npmjs.com/package/@painda/testing) | Test utilities for PP apps | [![npm](https://img.shields.io/npm/v/@painda/testing)](https://www.npmjs.com/package/@painda/testing) |

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
import { PPClient } from "@painda/core";

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
MIT License. Open Core forever.
