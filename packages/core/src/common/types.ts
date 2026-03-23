import type { PPSchemaRegistry } from "./schema.js";
import type { PPAdapter } from "./adapter.js";
import type { RecoveryOptions } from "./recovery.js";
import type { PresenceOptions } from "./presence.js";
import type { PPLoggerOptions } from "./logger.js";

export type PPMode = "chat" | "media" | "gaming" | "voice";

export type PPModeId = 0 | 1 | 2 | 3;

export const MODE_MAP: Record<PPMode, PPModeId> = {
  chat: 0,
  media: 1,
  gaming: 2,
  voice: 3,
};

export const MODE_REVERSE: Record<PPModeId, PPMode> = {
  0: "chat",
  1: "media",
  2: "gaming",
  3: "voice",
};

export interface PPMessage<T = unknown> {
  type: string;
  payload: T;
}

export interface PPFrameHeader {
  version: number;
  mode: PPMode;
  compressed: boolean;
  payloadLength: number;
}

export interface PPDecodedFrame<T = unknown> {
  header: PPFrameHeader;
  message: PPMessage<T>;
}

// ---- Compression Config ----

export interface PPCompressionConfig {
  /** Minimum payload size (bytes) before compression is applied. Default: 1024 */
  threshold?: number;
  /** Compression algorithm. Default: "deflate" */
  algorithm?: "deflate" | "gzip" | "none";
}

// ---- Heartbeat Config ----

export interface PPHeartbeatConfig {
  /** Ping interval in ms. Default: 30000 */
  interval?: number;
  /** How long to wait for pong before terminating (ms). Default: 10000 */
  timeout?: number;
  /** Custom handler when a client times out. */
  onTimeout?: (socket: PPClientSocket) => void;
}

// ---- Rate Limit Config ----

export type PPRateLimitStrategy = "fixed-window" | "sliding-window";

export interface PPRateLimitConfig {
  /** Max messages per second per client. 0 = unlimited. Default: 0 */
  maxPerSecond?: number;
  /** Max messages per minute per client. 0 = unlimited. Default: 0 */
  maxPerMinute?: number;
  /** Rate limiting strategy. Default: "fixed-window" */
  strategy?: PPRateLimitStrategy;
  /** Custom handler when a client is rate limited. */
  onLimit?: (socket: PPClientSocket) => void;
  /** Per-namespace overrides. */
  namespaceOverrides?: Record<string, { maxPerSecond?: number; maxPerMinute?: number }>;
}

// ---- Reconnect Config (Client) ----

export type PPReconnectStrategy = "exponential" | "linear" | "fibonacci";

export interface PPReconnectConfig {
  /** Enable reconnect. Default: false */
  enabled?: boolean;
  /** Reconnect strategy. Default: "exponential" */
  strategy?: PPReconnectStrategy | ((attempt: number) => number);
  /** Base delay in ms (for exponential/linear). Default: 1000 */
  baseDelay?: number;
  /** Maximum delay between reconnect attempts (ms). Default: 30000 */
  maxDelay?: number;
  /** Maximum number of reconnect attempts. 0 = unlimited. Default: 10 */
  maxAttempts?: number;
  /** Add random jitter to delay. Default: true */
  jitter?: boolean;
  /** Called on each reconnect attempt. */
  onReconnect?: (attempt: number) => void;
  /** Called when all attempts exhausted. */
  onGiveUp?: () => void;
}

// ---- Server Options ----

export interface PPServerOptions {
  port: number;
  host?: string;
  mode?: PPMode;
  registry?: PPSchemaRegistry;

  /** Heartbeat configuration. Pass false to disable. */
  heartbeat?: PPHeartbeatConfig | false;
  /** @deprecated Use heartbeat.interval instead */
  heartbeatInterval?: number;

  /** Compression configuration. */
  compression?: PPCompressionConfig;

  /** Rate limiting configuration. */
  rateLimit?: PPRateLimitConfig;
  /** @deprecated Use rateLimit.maxPerSecond instead */
  maxMessagesPerSecond?: number;

  /** Adapter for horizontal scaling. Default: InMemoryAdapter */
  adapter?: PPAdapter;

  /** Connection state recovery. Pass true for defaults, or RecoveryOptions. */
  recovery?: boolean | RecoveryOptions;

  /** Presence system options. */
  presence?: PresenceOptions;

  /** Logger configuration. Default: level "info", console transport. */
  logger?: PPLoggerOptions;

  // ---- Security ----

  /** Maximum frame size in bytes. Default: 1_048_576 (1 MB) */
  maxPayload?: number;

  /** Maximum decompressed payload size in bytes. Default: 10_485_760 (10 MB) */
  maxDecompressedSize?: number;

  /** Allowed origins for WebSocket connections. Empty = allow all. */
  allowedOrigins?: string[];

  /** Maximum concurrent connections per IP address. 0 = unlimited. Default: 50 */
  maxConnectionsPerIp?: number;

  /** Secret for HMAC-signing recovery session IDs. Enables recovery session verification. */
  recoverySecret?: string;
}

// ---- Client Options ----

export interface PPClientOptions {
  url: string;
  mode?: PPMode;
  registry?: PPSchemaRegistry;

  /** Acknowledgement callback timeout (ms). Default: 10000 */
  ackTimeout?: number;

  /** Token refresh callback — called before each connect/reconnect. */
  getToken?: () => Promise<string | null>;

  /** Reconnect configuration. Pass true for defaults, or PPReconnectConfig. */
  reconnect?: boolean | PPReconnectConfig;
  /** @deprecated Use reconnect.baseDelay instead */
  reconnectInterval?: number;
  /** @deprecated Use reconnect.maxAttempts instead */
  maxReconnectAttempts?: number;

  /** Logger configuration. */
  logger?: PPLoggerOptions;
}

// --- Broadcast targets (Socket.io-style chaining) ---

/** Chainable broadcaster for socket.to("room").emit() and socket.broadcast.emit() patterns. */
export interface PPBroadcastTarget {
  emit<T = unknown>(type: string, payload: T): void;
  send<T = unknown>(message: PPMessage<T>): void;
}

/** Chainable broadcaster for server.in("room") / server.except("room") patterns. */
export interface PPServerBroadcastTarget extends PPBroadcastTarget {
  /** Fetch all sockets currently in the target room(s). */
  fetchSockets(): Promise<PPClientSocket[]>;
  /** Disconnect all sockets in the target room(s). */
  disconnectSockets(close?: boolean): Promise<void>;
  /** Exclude sockets in given room(s) from the broadcast. */
  except(roomId: string | string[]): PPServerBroadcastTarget;
}

// --- Typed event system ---

export interface PPClientSocket {
  id: string;
  /** Send a PPMessage (binary-encoded). */
  send<T = unknown>(message: PPMessage<T>): void;
  /** DX shorthand: socket.emit("chat", { text: "hi" }) */
  emit<T = unknown>(type: string, payload: T): void;
  sendRaw(frame: Uint8Array): void;
  close(code?: number, reason?: string): void;
  /** Listen for system events (message, close, error). */
  on<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  /** Listen for any message type by name — fires with the message payload. */
  on(event: string, listener: (payload: unknown) => void): void;
  /** Listen once, then auto-remove. */
  once<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  once(event: string, listener: (payload: unknown) => void): void;
  off<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  off(event: string, listener: (payload: unknown) => void): void;
  /** Catch-all listener */
  onAny(listener: (event: string, ...args: unknown[]) => void): void;
  offAny(listener: (event: string, ...args: unknown[]) => void): void;
  /** Arbitrary metadata. */
  data: Record<string, unknown>;
  /** Set a tag for grouping/filtering. */
  setTag(key: string, value: string): void;
  /** Get a tag value. */
  getTag(key: string): string | undefined;
  /** Check if the client has a specific tag (optionally matching value). */
  hasTag(key: string, value?: string): boolean;
  /** Remove a tag. */
  removeTag(key: string): void;
  /** Get all tags. */
  getAllTags(): Map<string, string>;

  // ---- Room API (Socket.io-compatible) ----

  /** Join a generic adapter room. Promise resolves when the client is registered. */
  join(roomId: string): Promise<void>;
  /** Leave a generic adapter room. */
  leave(roomId: string): Promise<void>;
  /** All rooms this socket is currently in (snapshot). */
  readonly rooms: Set<string>;
  /**
   * Broadcast to all sockets in `roomId`, excluding this socket.
   * @example socket.to("game-1").emit("update", delta)
   */
  to(roomId: string): PPBroadcastTarget;
  /**
   * Broadcast to all connected sockets, excluding this socket.
   * @example socket.broadcast.emit("announcement", msg)
   */
  readonly broadcast: PPBroadcastTarget;

  /**
   * Set a per-send ack timeout for the next emit/send call.
   * Returns a chainable object whose `emit` fires a callback on ack or timeout.
   *
   * @example
   * ```ts
   * socket.timeout(3000).emit("save", data, (err, response) => {
   *   if (err) console.error("No ack within 3s");
   *   else console.log("Saved:", response);
   * });
   * ```
   */
  timeout(ms: number): PPTimeoutEmitter;
}

/** Returned by `socket.timeout(ms)` — provides a one-shot timed emit with ack callback. */
export interface PPTimeoutEmitter {
  emit<T = unknown>(type: string, payload: T, callback: (err: Error | null, ...args: unknown[]) => void): void;
}

/**
 * Typed socket with compile-time event safety.
 *
 * @template TListen  Events the server receives from the client (client → server).
 * @template TEmit    Events the server sends to the client (server → client).
 *
 * @example
 * ```ts
 * interface ClientEvents { move: { x: number; y: number } }
 * interface ServerEvents { state: GameState }
 *
 * const server = new PPServer<ClientEvents, ServerEvents>({ port: 3000 });
 * server.on("connection", (socket) => {
 *   socket.on("move", (data) => {  // data: { x: number; y: number }
 *     socket.emit("state", newState); // newState: GameState
 *   });
 * });
 * ```
 */
export interface PPTypedSocket<
  TListen extends Record<string, unknown> = Record<string, unknown>,
  TEmit extends Record<string, unknown> = Record<string, unknown>,
> extends Omit<PPClientSocket, "on" | "once" | "off" | "emit"> {
  /** Listen for a typed client→server event. */
  on<K extends keyof TListen & string>(event: K, listener: (payload: TListen[K]) => void): void;
  on<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  on(event: string, listener: (payload: unknown) => void): void;

  once<K extends keyof TListen & string>(event: K, listener: (payload: TListen[K]) => void): void;
  once<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  once(event: string, listener: (payload: unknown) => void): void;

  off<K extends keyof TListen & string>(event: K, listener: (payload: TListen[K]) => void): void;
  off<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  off(event: string, listener: (payload: unknown) => void): void;

  /** Send a typed server→client event. */
  emit<K extends keyof TEmit & string>(type: K, payload: TEmit[K]): void;
  emit<T = unknown>(type: string, payload: T): void;
}

export interface PPClientSocketEventMap {
  message: (data: PPMessage) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

export interface PPServerEventMap<
  TListen extends Record<string, unknown> = Record<string, unknown>,
  TEmit extends Record<string, unknown> = Record<string, unknown>,
> {
  connection: (client: PPTypedSocket<TListen, TEmit>) => void;
  disconnection: (client: PPTypedSocket<TListen, TEmit>) => void;
  error: (error: Error) => void;
  close: () => void;
  /** Fired when a client joins a typed room. */
  roomJoin: (client: PPTypedSocket<TListen, TEmit>, roomId: string) => void;
  /** Fired when a client leaves a typed room. */
  roomLeave: (client: PPTypedSocket<TListen, TEmit>, roomId: string) => void;
}

export interface PPClientEventMap {
  open: () => void;
  message: (data: PPMessage) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
  /** Server-sent error (rate limit, middleware, namespace). */
  serverError: (data: { code: string; message: string }) => void;
  recovery: (data: { sid: string; recovered: boolean; missedCount: number }) => void;
  roomState: (data: { room: string; state: unknown; full: boolean }) => void;
  roomDelta: (data: { room: string; delta: unknown }) => void;
  presence: (data: { presences: unknown[] }) => void;
  reconnecting: (data: { attempt: number; delay: number }) => void;
  reconnectFailed: () => void;
}

/**
 * Typed message handler that infers the payload type from a schema registry.
 */
export type PPTypedMessageHandler<
  TEvents extends Record<string, unknown>,
  K extends keyof TEvents,
> = (client: PPClientSocket, message: PPMessage<TEvents[K]>) => void;
