# 🐼 @painda/client

**The versatile, browser-compatible SDK for the PaindaProtocol.**

`@painda/client` is the official client-side module for interacting with PaindaProtocol servers. It provides a familiar, Socket.io-like API while leveraging the full power of transparent binary encoding and state synchronization.

### ⚡ Highlights

- **Binary Schema Support**: Use custom binary encoders/decoders for ultra-low overhead.
- **Auto Reconnect**: Robust reconnection strategies with exponential, linear, and fibonacci backoff.
- **React Ready**: Includes a first-class `usePP` hook for seamless React integration.
- **Message Queueing**: Automatically queues messages while offline and flushes on reconnect.
- **Token Refresh**: `getToken` callback is called on every reconnect — always a fresh JWT.
- **Delta Sync**: Built-in support for receiving and applying binary state diffs.

## Installation

```bash
npm install @painda/client
```

## Quick Start

```typescript
import { PPClient } from "@painda/client";

const client = new PPClient({
  url: "wss://your-game-server.com/ws",
  reconnect: true,
  getToken: async () => {
    // Called on every connect & reconnect — fresh token each time
    return await fetchAuthToken();
  },
});

client.on("chat_message", (msg) => {
  console.log("New chat message:", msg);
});

client.emit("chat_message", { text: "Hello from Painda Client" });
```

## Event Listeners & Cleanup

### `on(event, handler)` — Subscribe to events

```typescript
client.on("game:state", (state) => {
  console.log("Game state:", state);
});
```

### `off(event, handler)` — Unsubscribe from events

```typescript
const handler = (state: GameState) => setGameState(state);

// Subscribe
client.on("game:state", handler);

// Unsubscribe (important for cleanup!)
client.off("game:state", handler);
```

### `once(event, handler)` — Listen once, auto-remove

```typescript
client.once("open", () => {
  console.log("Connected for the first time!");
});
```

### `onAny(handler)` / `offAny(handler)` — Catch-all listeners

```typescript
// Debug: log every event
const debugHandler = (event: string, ...args: unknown[]) => {
  console.log(`[PP] ${event}:`, ...args);
};
client.onAny(debugHandler);

// Cleanup:
client.offAny(debugHandler);
```

---

## React Integration

### `usePP()` Hook

The `usePP` hook manages the PPClient lifecycle automatically — connects on mount, disconnects on unmount, and provides stable references.

```tsx
import { usePP } from "@painda/client";

function ChatComponent() {
  const { emit, on, connected, state } = usePP({
    url: "wss://my-game.com/ws",
    reconnect: true,
    getToken: async () => await refreshToken(),
  });

  useEffect(() => {
    // on() returns an unsubscribe function — perfect for useEffect cleanup
    return on("chat", (msg) => {
      setMessages(prev => [...prev, msg]);
    });
  }, [on]);

  // Subscribe to multiple events:
  useEffect(() => {
    const unsubs = [
      on("player_joined", (data) => setPlayers(data.players)),
      on("player_left", (data) => setPlayers(data.players)),
      on("game:state", (state) => setGameState(state)),
    ];
    return () => unsubs.forEach(u => u());
  }, [on]);

  return <div>{connected ? "🟢 Connected" : "🔴 Disconnected"}</div>;
}
```

### React useEffect Cleanup (without `usePP`)

If you're using `PPClient` directly with React, always clean up event listeners:

```tsx
useEffect(() => {
  const handler = (data: GameState) => setGameState(data);
  client.on("game:state", handler);

  return () => {
    client.off("game:state", handler); // ← Essential cleanup!
  };
}, [client]);
```

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
