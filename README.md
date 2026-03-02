<div align="center">
  <h1>🐼 PaindaProtocol (PP)</h1>
  <p><strong>Binary Speed. Typed Power. Built for Performance.</strong></p>
  <p>The high-performance, protocol-first backbone for real-time applications.</p>
  <p>
    <a href="https://tools.painda.tools/docs"><strong>📖 Read the Documentation</strong></a>
  </p>
</div>

<br />

**PaindaProtocol (PP)** is a modern alternative to legacy real-time tools like Socket.io. It unites the blazing speed of raw WebSockets with the incredible developer experience (DX) of strongly-typed JavaScript frameworks. PP relies on a highly efficient, *zero-copy binary frame architecture* instead of CPU-heavy JSON stringification.

---

## 🔥 Features
* **Zero-Copy Binary Framing:** Native `DataView` allocations instead of massive JSON string garbage collection.
* **100% Type-Safe Contracts:** Schemas ensure that the data flying over the wire is strictly typed in TypeScript.
* **Massive Throughput:** Hits over 30,000 msg/s on standard web connections vs Socket.io's ~100 msg/s.
* **Plugin / Module Architecture:** Start with `@painda/core`, add `@painda/gaming` for Multiplayer state-syncing, or `@painda/chat` for messaging.
* **Socket.io-like DX:** You get the speed of `uWebSockets` combined with the simple APIs of `Socket.io` (e.g., `client.on('message')`).

---

## 📦 Packages
This repository contains the core protocol and its official modules:

| Package | Description | Status |
|---------|-------------|--------|
| **[`@painda/core`](./packages/core)** | The binary standard, `PPServer`, `PPClient`, and Schema Registry. (Required) | ✅ Alpha |
| **[`@painda/gaming`](./packages/gaming)** | **The Delta Engine.** Synchronizes multiplayer states with binary patches. | ✅ Alpha |
| **[`@painda/chat`](./packages/chat)** | Rooms, direct messages, broadcating. | ✅ Alpha |
| **[`@painda/video`](./packages/video)**| Low-latency WebRTC Signaling. | ✅ Alpha |

For full details on using these packages, visit the [PaindaProtocol Documentation](https://tools.painda.tools/docs).

---

## 🚀 Quick Start

### 1. Installation
In your project, install the core module:
```bash
npm install @painda/core
```

### 2. Define a Schema 
Schemas turn slow JSON into lightning-fast binary.
```typescript
import { PPSchemaRegistry } from "@painda/core";

export const registry = new PPSchemaRegistry();
registry.register("player-move", {
  id: 1,
  encode: (payload) => {
    const buf = new Uint8Array(8);
    new DataView(buf.buffer).setFloat64(0, payload.x, true);
    return buf;
  },
  decode: (buf) => {
    const x = new DataView(buf.buffer).getFloat64(0, true);
    return { x };
  }
});
```

### 3. Start the Server
```typescript
import { PPServer } from "@painda/core";
import { registry } from "./schemas";

const server = new PPServer({ port: 3000, registry });

server.on("connection", (client) => {
  client.on("message", (msg) => {
    if (msg.type === "player-move") {
       console.log("Player moved to:", msg.payload.x);
       client.send(msg); // Echo back in pure binary
    }
  });
});
```

### 4. Connect the Client
```typescript
import { PPClient } from "@painda/core";
import { registry } from "./schemas";

const client = new PPClient({ url: "ws://localhost:3000", registry });

client.on("open", () => {
    client.send({ type: "player-move", payload: { x: 50.5 } });
});
```

---

## 📈 Benchmarks

PaindaProtocol was built out of frustration with Socket.io's overhead in gaming and heavy real-time environments. Here are live results over a standard internet connection:

| Metric | PaindaProtocol (PP) | Socket.io | Raw WS |
|---|---|---|---|
| **Latency (Median)** | **~37 ms** | ~41 ms | ~44 ms |
| **Throughput (msg/s)** | **~30,400 msg/s** | ~100 msg/s | ~29,100 msg/s |

*Disclaimer: Raw WS loses against PP in throughput benchmarks when transmitting typed/complex data because JSON parsing creates memory pressure in the V8 engine JS event loop. PP avoids this via binary DataViews.*

---

## 🎮 The Delta Engine (`@painda/gaming`)

When building real-time multiplayer games, broadcasting the `(x,y)` coordinates of 100 players 60 times a second will destroy your server's bandwidth. 
The **Delta Engine** solves this:

```typescript
import { StateManager } from "@painda/gaming";

const state = new StateManager({ players: { p1: {x: 10, hp: 100} } });

// In your 60 FPS Game Loop, a player is injured:
state.update(s => { s.players.p1.hp = 90; });

const patch = state.getDelta(); 
// Output: { players: { p1: { hp: 90 } } } -> 100x smaller payload!

// Only this tiny patch is broadcasted to clients over binary!
server.broadcast(patch);
```

---

## 📝 License
MIT License. Open Core forever. 
