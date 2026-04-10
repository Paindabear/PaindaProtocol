# 🐼 @painda/gaming

**The Delta Engine for real-time multiplayer games and high-frequency state synchronization.**

`@painda/gaming` is the state-synchronization engine for the PaindaProtocol ecosystem. It provides ultra-fast binary diffing and patching, allowing you to synchronize complex game states at **60 FPS** with **100x smaller payloads** than raw JSON.

### ⚡ Highlights

- **Zero-Copy Diffs**: Uses a highly optimized binary-diffing algorithm.
- **Delta Sync**: Only send changed fields to minimize bandwidth.
- **60 FPS Ready**: Minimal CPU overhead during serialization/deserialization.
- **Seamless Integration**: First-class support for Painda's **Typed Rooms**.

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
Returns only the changed fields between two objects. Uses Myers O(ND) algorithm for arrays.

### `patch(target, delta)`
Applies a delta to an existing object. **Mutates in place** for performance.

### `patchImmutable(state, delta)` _(New)_
Immutable variant of `patch()`. Creates a deep clone before applying the delta.
**Use this in React** — it returns a new reference so `setState` detects the change.

### `StateManager`
High-level wrapper that tracks state and produces diffs.

- `update(fn)` — mutate state via callback
- `getDelta()` — get diff since last call
- `getState()` — get current full state

---

## ⚠️ React Compatibility

`patch()` mutates the state object **in-place**. This is intentional for performance in game loops, but it **breaks React's state detection** because the reference stays the same.

```typescript
// ❌ WRONG — React won't re-render (same reference):
client.on("game:delta", (delta) => {
  setGameState(prev => {
    patch(prev, delta);  // mutates prev
    return prev;         // same object reference → no re-render
  });
});

// ✅ CORRECT — Use patchImmutable (new reference):
import { patchImmutable } from "@painda/gaming";

client.on("game:delta", (delta) => {
  setGameState(prev => patchImmutable(prev, delta));
});
```

---

## With PP Typed Rooms

Use Gaming's `diff` as the room's diff algorithm so deltas use `PP_DELETED` for deleted keys; clients apply them with `patchImmutable` (React) or `patch` (vanilla):

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

**Client (React)**

```typescript
import { patchImmutable } from '@painda/gaming';

client.on('roomDelta', ({ room, delta }) => {
  setGameState(prev => patchImmutable(prev, delta));
});
```

**Client (Vanilla JS)**

```typescript
import { patch } from '@painda/gaming';

client.on('roomDelta', ({ room, delta }) => {
  patch(localState[room], delta); // in-place, fast
});
```

See [docs/GAMING_API_ANALYSIS.md](../../docs/GAMING_API_ANALYSIS.md) for full integration details.

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
