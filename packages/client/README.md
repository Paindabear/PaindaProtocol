# 🐼 @painda/client

**The versatile, browser-compatible SDK for the PaindaProtocol.**

`@painda/client` is the official client-side module for interacting with PaindaProtocol servers. It provides a familiar, Socket.io-like API while leveraging the full power of transparent binary encoding and state synchronization.

### ⚡ Highlights

- **Binary Schema Support**: Use custom binary encoders/decoders for ultra-low overhead.
- **Auto Reconnect**: Robust reconnection strategies with exponential and linear backoff.
- **React Ready**: Includes a first-class `usePP` hook for seamless React integration.
- **Message Queueing**: Automatically queues messages while offline and flushes on reconnect.
- **Delta Sync**: Built-in support for receiving and applying binary state diffs.

## Installation

```bash
npm install @painda/client
```

## Usage

```typescript
import { PPClient } from "@painda/client";

const client = new PPClient({
  url: "wss://your-game-server.com/ws",
  reconnect: true
});

client.on("chat_message", (msg) => {
  console.log("New chat message:", msg);
});

client.emit("chat_message", { text: "Hello from Painda Client" });
```

### React Hook

```typescript
import { usePP } from "@painda/client/react";

function ChatComponent() {
  const { emit, on, connected } = usePP({ url: "wss://my-game.com/ws" });

  useEffect(() => {
    return on("chat", (msg) => {
      console.log(msg);
    });
  }, [on]);

  return <div>{connected ? "Connected" : "Disconnected"}</div>;
}
```
