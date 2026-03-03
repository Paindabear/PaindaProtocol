# @painda/client

Browser-compatible client SDK for the PaindaProtocol.

## Features
- **JSON ↔ Binary Bridge**: Send JSON on the client, goes as binary over the wire, decoded by the Painda Server.
- **Auto Reconnect**: Configurable exponential and linear backoff reconnection strategies.
- **React Hook (`usePP`)**: Simple and reactive connection management in React.
- **Message Queueing**: Queues messages while offline and flush upon reconnection.

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
