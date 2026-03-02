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

```typescript
import { PPServer } from '@painda/core';

interface GameState {
  phase: string;
  score: Record<string, number>;
}

const room = server.room<GameState>('lobby', {
  phase: 'waiting',
  score: {},
});

// Delta auto-broadcast at 60 FPS
room.update(s => { s.score['player1'] = 10; });
```

## License

MIT
