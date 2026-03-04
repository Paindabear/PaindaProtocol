# @painda/gaming

**The Delta Engine** — state synchronization with binary diffs for real-time games and collaborative apps.

Part of the [PaindaProtocol](https://pp.painda.tools) ecosystem.

## Installation

```bash
npm install @painda/gaming @painda/core
```

## Quick Start

```typescript
import { StateManager } from '@painda/gaming';

const state = new StateManager({
  players: {
    p1: { x: 10, y: 0, hp: 100 },
  },
});

// Update state
state.update(s => {
  s.players.p1.hp = 90;
  s.players.p1.x = 15;
});

// Get minimal delta (only changed fields)
const delta = state.getDelta();
// → { players: { p1: { hp: 90, x: 15 } } }
// 100x smaller than sending the full state!

// Broadcast delta to all clients
server.broadcast({ type: 'delta', payload: delta });
```

## API

### `diff(prev, next)`
Returns only the changed fields between two objects.

### `patch(target, delta)`
Applies a delta to an existing object (mutates in place).

### `StateManager`
High-level wrapper that tracks state and produces diffs.

- `update(fn)` — mutate state via callback
- `getDelta()` — get diff since last call
- `getState()` — get current full state

## With PP Typed Rooms

Use Gaming’s `diff` as the room’s diff algorithm so deltas use `PP_DELETED` for deleted keys; clients apply them with `patch`:

**Server**

```typescript
import { PPServer } from '@painda/core';
import { diff } from '@painda/gaming';

const server = new PPServer({ port: 7000 });
const room = server.room('lobby', { phase: 'waiting', score: {} }, {
  diffAlgorithm: (prev, next) => diff(prev, next),
});
room.start();
room.update(s => { s.score['player1'] = 10; });
```

**Client** (apply incoming deltas)

```typescript
import { patch } from '@painda/gaming';

client.on('roomDelta', ({ room, delta }) => {
  patch(localState[room], delta);
});
```

See [docs/GAMING_API_ANALYSIS.md](../../docs/GAMING_API_ANALYSIS.md) for full integration details.

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
