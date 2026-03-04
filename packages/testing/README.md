# @painda/testing

**Test utilities** for PaindaProtocol applications.

Spin up test server + client pairs, wait for messages, collect results — all in a few lines.

Part of the [PaindaProtocol](https://pp.painda.tools) ecosystem.

## Installation

```bash
npm install --save-dev @painda/testing @painda/core
```

## Quick Start

```typescript
import { createTestEnv, waitForMessage } from '@painda/testing';

const { server, client, cleanup } = await createTestEnv();

server.on('connection', (socket) => {
  socket.on('message', (msg) => {
    socket.emit('echo', msg.payload);
  });
});

client.emit('ping', 'hello');
const response = await waitForMessage(client, 'echo');
console.log(response.payload); // "hello"

cleanup();
```

## API

### `createTestEnv(options?)`
Creates a server + connected client on a random port. Returns `{ server, client, port, cleanup }`.

### `waitForMessage(client, type, timeout?)`
Wait for a specific message type. Rejects after timeout (default 5s).

### `collectMessages(client, count, timeout?)`
Collect N messages from a client.

### `createTestClients(port, count)`
Create multiple connected clients for load testing.

### `waitFor(condition, timeout?, interval?)`
Poll a condition until it's true.

### `ppAssert(condition, message)`
Assert with descriptive error message.

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
