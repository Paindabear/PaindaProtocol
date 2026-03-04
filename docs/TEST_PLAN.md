# Test Plan — PaindaProtocol Packages

## Scope

| Area | Package | What to test |
|------|---------|--------------|
| Frame encoding/decoding | core | Round-trip encode/decode V1 and V2; magic, version, flags; payload length; compression flag; schema type ID; invalid buffer handling. |
| Schema registry | core | register, encode, decode, has, getTypeId, getTypeName; ID 0 reserved; duplicate type/ID throws. |
| Rate limiter | core | Fixed-window and sliding-window; maxPerSecond, maxPerMinute; onLimit callback; namespace overrides; remove. |
| Recovery | core | track, bufferMessage, addRoom, removeRoom, markDisconnected, getReplay; retention and eviction. |
| Delta engine | gaming | diff: identity, primitives, plain objects, nested, deleted keys (PP_DELETED), arrays. patch: apply delta, deletions, nested. StateManager: update, getState, getDelta. |

## Tooling

- **Runner**: Node.js built-in `node:test` (no extra dependency).
- **Location**: `packages/core/test/`, `packages/gaming/test/`.
- **Run**: `npm run test` in each package (or from root: `npm run test --workspace=@painda/core`).

## Implemented

- **core**: `frame.test.ts` (encode/decode round-trip, V2 header, JSON fallback).
- **gaming**: `diff-patch.test.ts` (diff identity/primitives/objects/deletes, patch apply), `state.test.ts` (StateManager getDelta, update).

## Future

- Integration tests: start PPServer, connect PPClient, send/receive frames.
- Rate limiter unit tests (mock time or fast intervals).
- Recovery unit tests (buffer, replay, retention).
