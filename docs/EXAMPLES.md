# Examples (Plan)

Short reference for typical setups. Full code is in the Quick Start sections of each package README.

## Core

- **Minimal server + client**: [packages/core/README.md](../packages/core/README.md#quick-start) — `PPServer` on a port, `PPClient` with `url`, message handlers.
- **Namespaces**: `server.of("/admin").use(authMiddleware).on("connection", ...)`.
- **Typed room**: `server.room<GameState>("lobby-1", initialState, { tickRate: 16, diffAlgorithm: ... })`, then `room.start()`, `room.update(s => { ... })`.
- **Presence**: `server.presence.track(socket, { status: "online", name: "Alex" })`, `server.presence.onChange(...)`.
- **Schema + binary**: `PPSchemaRegistry`, `registry.register("move", { id: 1, encode, decode })`, pass `registry` in `PPServerOptions` and `PPClientOptions`.

## Gaming

- **StateManager only**: [packages/gaming/README.md](../packages/gaming/README.md#quick-start) — `StateManager`, `update()`, `getDelta()`, broadcast delta yourself.
- **Gaming + Typed Rooms**: Use `diff` from `@painda/gaming` as `diffAlgorithm` when creating the room; on client use `patch(localState, delta)` on `roomDelta` events. See [packages/gaming/README.md](../packages/gaming/README.md#with-pp-typed-rooms) and [GAMING_API_ANALYSIS.md](./GAMING_API_ANALYSIS.md).

## Future

- Standalone runnable examples (e.g. `examples/chat`, `examples/game-loop`) can be added under `examples/` with their own `package.json` and instructions.
