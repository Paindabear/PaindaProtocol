# @painda/testing

Test utilities for asserting real-time synchronicity and game-logic functionality in **PaindaProtocol** via automated, synchronous test flows. 

When building reactive multiplayer systems or executing test-suites across delta-state engines, verifying exact frame delivery can be inherently flaky using real websockets. `@painda/testing` provides a zero-overhead simulated test environment that binds native `PPServer` and `PPClient` instances in-process so you can perform 100% deterministic test execution.

## Installation

```bash
npm install --save-dev @painda/testing
```

## Quick Start

The goal of this package is to remove WebSocket and port-binding boiler-plate for end-to-end integration tests (like Jest or Vitest).

```typescript
import { createTestEnv, waitForMessage, collectMessages } from "@painda/testing";
import { describe, it, expect } from "vitest";

describe("Game Server integration", () => {
  it("should connect, send an action and receive a state delta", async () => {
    // 1. Boot up a local ephemeral server and connected client in a single line
    const { server, client, cleanup } = await createTestEnv();
    
    // Setup your game logic...
    server.on("connection", (socket) => {
        socket.on("action", (data) => {
           socket.emit("state_update", { diff: { score: 10 } });
        });
    });

    // 2. Perform test operations
    client.send({ type: "action", payload: { type: "score" } });

    // 3. Await deterministic async responses (skips race conditions)
    const msg = await waitForMessage(client, "state_update");
    expect(msg.payload.diff.score).toBe(10);
    
    // 4. Must always unbind ports
    cleanup();
  });
});
```

## Utilities API

### `createTestEnv(options?)`
Creates a server on a random ephemeral high-port and automatically connects a client.
- **Returns**: `{ server, client, port, cleanup }`.
- Always call `cleanup()` in your `afterEach` or inline at the end of the test.

```typescript
const { server, client, port, cleanup } = await createTestEnv({
  serverOptions: { ... }, // Overrides for PPServer (e.g., custom payload limits)
  autoConnect: false // Spawns the server but lets you connect clients manually later
});
```

### `createTestClients(port, count)`
Useful for load testing or verifying multi-player room broadcasts.

```typescript
const { clients, cleanup } = await createTestClients(port, 4);
const [c1, c2, c3, c4] = clients;

// Wait for a broadcast to arrive to the first 3 clients natively:
Promise.all([
   waitForMessage(c1, "game_start"),
   waitForMessage(c2, "game_start"),
   waitForMessage(c3, "game_start")
]).then(() => {
   // Success!
});
```

### `waitForMessage(client, type, timeoutMs = 5000)`
Crucial for deterministic assertion testing. Instead of doing `client.on(..)` and waiting inside a test, this returns a Promise that resolves when the exact message type is consumed. Throws on timeout.

### `collectMessages(client, count, timeoutMs = 5000)`
Awaits exactly `N` responses. Excellent for testing recovery modes or batch emits.

### `waitFor(condition, timeoutMs, intervalMs)`
Generic polling utility asserting the internal state of custom game managers before proceeding with the assertion.

```typescript
await waitFor(() => gameManager.activePlayers.length === 2);
```
