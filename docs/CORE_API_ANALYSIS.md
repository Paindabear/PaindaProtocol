# @painda/core — API-Detailanalyse

## 1. Öffentliche API (Public API)

Alle über `packages/core/src/index.ts` exportierten Symbole bilden die **öffentliche API**. Änderungen an diesen Exports können Breaking Changes darstellen.

### 1.1 Frame & Encoding

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `encodeFrame`, `decodeFrame` | Funktion | Binary-Frame (V2, 16 Byte Header) en-/dekodieren; optional Schema-Registry, Kompression |
| `PP_MAGIC`, `PP_VERSION`, `PP_VERSION_1`, `PP_VERSION_2` | Konstante | Wire-Format-Versionen |
| `HEADER_SIZE`, `HEADER_SIZE_V2` | Konstante | Header-Größe (12 / 16 Bytes) |
| `EncodeOptions` | Typ | Optionen für `encodeFrame` (z. B. `compress`, `compressionThreshold`) |

### 1.2 Server & Client

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPServer` | Klasse | WebSocket-Server mit Namespaces, Middleware, Rate-Limit, Recovery, Adapter, Plugins, Rooms, Presence |
| `PPClient` | Klasse | Browser/Node-Client; Reconnect, Ack, Recovery, Token-Auth |
| `PPClientAckCallback`, `PPClientSendOptions` | Typ | Ack-Callback und Send-Optionen (volatile, namespace) |

### 1.3 Schema & Serializers

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPSchemaRegistry` | Klasse | Typed Contracts: `register(type, schema)`, `encode`/`decode` mit Type-ID |
| `PPSchema` | Typ | Schema-Definition (id, version?, encode, decode) |
| `jsonSerializer`, `stringSerializer`, `bufferSerializer`, `structSerializer`, `mixedSerializer` | Objekt/Funktion | Vordefinierte Serializer |
| `StructField` | Typ | Feld-Definition für `structSerializer` |

### 1.4 Namespaces

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPNamespace` | Klasse | Kanal pro Pfad (z. B. `/chat`); Connection/Message-Middleware, broadcast |
| `PPNamespacedSocket` | Klasse | Socket-Ansicht innerhalb eines Namespace |
| `PPAckMessage`, `PPAckCallback`, `PPSendOptions` | Typ | Ack-Nachrichten und Send-Optionen |

### 1.5 Middleware

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPMiddlewarePipeline` | Klasse | `useConnection(fn)`, `useMessage(fn)`, `runConnection`, `runMessage` |
| `PPConnectionMiddleware`, `PPMessageMiddleware` | Typ | Middleware-Signaturen (socket, next) bzw. (socket, message, next) |

### 1.6 Transport

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PollingTransport`, `PPTransportManager` | Klasse | Fallback-Transport (Polling) und Manager |
| `PPTransport`, `PPTransportType`, `PPTransportEvents` | Typ | Transport-Interface und Events |

### 1.7 Recovery

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPRecoveryManager` | Klasse | Puffer pro Client (Nachrichten + Offsets), Room-Memberships, Replay nach Reconnect |
| `RecoveryOptions` | Typ | `maxBufferSize`, `retentionMs` |

### 1.8 Adapter

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `InMemoryAdapter` | Klasse | Single-Process-Adapter (Rooms, publish/subscribe lokal) |
| `PPAdapter` | Typ | Interface für Redis/Postgres-Adapter (publish, subscribe, addToRoom, getClientsInRoom, …) |

### 1.9 Errors & Logger

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPError` | Klasse | Fehler mit Code und Kontext |
| `PPErrorCode`, `PPErrorContext` | Typ | Fehlercodes und Kontext |
| `createLogger`, `silentLogger` | Funktion | Logger-Factory |
| `PPLogger`, `PPLogLevel`, `PPLogTransport`, `PPLoggerOptions` | Typ | Logger-API |

### 1.10 Plugin System

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPPluginManager` | Klasse | Hooks: connect, message, disconnect; `register(plugin)` |
| `PPPlugin`, `PPPluginContext`, `PPPluginHooks` | Typ | Plugin-Interface |

### 1.11 Typed Rooms

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPTypedRoom` | Klasse | Raum mit typisiertem State; Tick-basierte Delta-Sync, join/leave, auth, onFull |
| `PPRoomManager` | Klasse | Verwaltung von `PPTypedRoom`-Instanzen |
| `TypedRoomOptions`, `PPDiffAlgorithm`, `PPRoomFullPolicy` | Typ | Optionen (maxClients, tickRate, syncOnJoin, auth, diffAlgorithm, onFull) |

### 1.12 Presence

| Export | Typ | Beschreibung |
|--------|-----|--------------|
| `PPPresence` | Klasse | Track/untrack Clients mit Metadaten; join/update/leave Events; periodischer Sync |
| `PresenceData`, `PresenceEntry`, `PresenceOptions` | Typ | Präsenz-Daten und Optionen (syncInterval, broadcastOnChange, syncMode, maxMetadataSize) |

### 1.13 Types (alle re-exports)

`PPMode`, `PPModeId`, `PPMessage`, `PPFrameHeader`, `PPDecodedFrame`, `PPServerOptions`, `PPClientOptions`, `PPServerEventMap`, `PPClientEventMap`, `PPClientSocket`, `PPClientSocketEventMap`, `PPTypedMessageHandler`, `PPCompressionConfig`, `PPHeartbeatConfig`, `PPRateLimitConfig`, `PPRateLimitStrategy`, `PPReconnectConfig`, `PPReconnectStrategy`.

---

## 2. DX-Check (Developer Experience)

- **Einstieg**: `new PPServer({ port })` und `new PPClient({ url })` reichen für Minimal-Setup. Optional: `registry`, `heartbeat`, `rateLimit`, `recovery`, `presence`, `adapter`.
- **Socket.io-ähnlich**: Namespaces (`server.of("/chat")`), Rooms (über `PPRoomManager` / `PPTypedRoom`), Middleware (`use`, `useMessage`), Broadcast, Ack (client-seitig mit Callback).
- **Typisierung**: `PPMessage<T>`, Schema-Registry mit generischen `encode`/`decode`, Typed Rooms `<TState>`.
- **Fehlerbehandlung**: `PPError` mit Code; Server sendet `__pp_error`; Client hat `on("error", …)` und `on("serverError", …)`.
- **Interna**: Einige Klassen sind öffentlich exportiert, aber primär für erweiterte Szenarien (z. B. `PPNamespace`, `PPMiddlewarePipeline`). Keine strikte Trennung „public“ vs „internal“ in der Typ-Definition.

---

## 3. Public-API-Abgrenzung (Empfehlung)

- **Stabil halten**: `PPServer`, `PPClient`, `encodeFrame`, `decodeFrame`, `PPSchemaRegistry`, `PPSchema`, Serializers, `PPNamespace`, `PPNamespacedSocket`, `PPMiddlewarePipeline`, `PPRecoveryManager`, `InMemoryAdapter`, `PPAdapter`, `PPError`, `createLogger`, `PPPluginManager`, `PPTypedRoom`, `PPRoomManager`, `PPPresence` sowie alle in Abschnitt 1 genannten Typen.
- **Vorsicht bei**: `PollingTransport`, `PPTransportManager` — wenn nur für Fallback gedacht, ggf. als „experimental“ markieren oder später in separates Paket verschieben.
- **Nicht dokumentieren als primäre API**: Implementierungsdetails von `PPClientSocketImpl` (nur `PPClientSocket`-Interface ist Kontrakt); interne Events wie `__pp_session`, `__pp_ack` sind Protokoll-Detail.

---

## 4. Abhängigkeiten

- **Runtime**: `ws` (WebSocket-Server/Client für Node).
- **Node-spezifisch**: `node:zlib` (deflate/inflate in `frame.ts`), `node:crypto` (UUID, HMAC für Recovery) — Browser-Build müsste hier Alternativen oder Stubs haben, falls Core jemals im Browser laufen soll (aktuell nur Client im Browser).
