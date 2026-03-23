# 🐼 @painda/testing

**Robust test utilities for PaindaProtocol applications.**

`@painda/testing` provides a comprehensive suite of tools to help you write reliable unit and integration tests for your real-time logic. Features include automated test environment setup, message collection, and asynchronous wait-for utilities.

### ⚡ Highlights

- **Automated Test Environments**: Quickly spin up a linked server and client on random ports.
- **Asynchronous Utilities**: `waitForMessage` and `collectMessages` simplify complex async assertions.
- **State Polling**: `waitFor` helper to assert eventual consistency in typed rooms.
- **Type-Safe Assertions**: Built-in `ppAssert` with descriptive error reporting.

## Installation

```bash
npm install @painda/testing @painda/core @painda/client --save-dev
```

## Quick Start

```typescript
import { createTestEnv, waitForMessage } from '@painda/testing';

const { server, client, cleanup } = await createTestEnv();

client.emit('greet', 'hello');
const response = await waitForMessage(client, 'welcome');

cleanup();
```

## License

**MIT License** — free for private projects, open-source, and community use.
