import { WebSocketServer, WebSocket, type RawData } from "ws";
import crypto from "node:crypto";
import { EventEmitter } from "events";
import { encodeFrame, decodeFrame, type EncodeOptions } from "./common/frame.js";
import type { PPSchemaRegistry } from "./common/schema.js";
import type { PPVirtualClient } from "./common/virtual-client.js";
import type {
  PPServerOptions,
  PPMessage,
  PPMode,
  PPClientSocket,
  PPServerEventMap,
  PPClientSocketEventMap,
  PPRateLimitConfig,
  PPHeartbeatConfig,
  PPCompressionConfig,
  PPBroadcastTarget,
  PPServerBroadcastTarget,
  PPTypedSocket,
  PPTimeoutEmitter,
} from "./common/types.js";
import { PPNamespace, type PPNamespacedSocket, type PPAckMessage } from "./common/namespace.js";
import { PPMiddlewarePipeline, type PPConnectionMiddleware, type PPMessageMiddleware } from "./common/middleware.js";
import { PPRecoveryManager, type RecoveryOptions } from "./common/recovery.js";
import { PPError } from "./common/errors.js";
import { InMemoryAdapter, type PPAdapter } from "./common/adapter.js";
import { PPPluginManager, type PPPlugin, type PPPluginContext } from "./common/plugin.js";
import { PPRoomManager, type PPTypedRoom, type TypedRoomOptions } from "./common/typed-room.js";
import { PPPresence, type PresenceOptions } from "./common/presence.js";
import { createLogger, type PPLogger } from "./common/logger.js";
import { computeDiff, type PPDiffAlgorithm } from "./common/diff.js";
// import { sendTelemetryPing } from "./common/node/telemetry.js";

type EventHandler = (...args: unknown[]) => void;

// ---- Socket-to-Server Bridge (avoids circular dependency) ----

interface SocketServerContext {
  readonly adapter: PPAdapter;
  readonly clients: Map<string, PPClientSocketImpl>;
  readonly mode: PPMode;
  readonly registry?: PPSchemaRegistry;
  readonly encodeOpts: EncodeOptions;
}

// ---- Socket-level Broadcast Operator ----

class PPBroadcastOperator implements PPBroadcastTarget {
  constructor(
    private readonly ctx: SocketServerContext,
    private readonly targetRoom: string | null,
    private readonly excludeId: string | null,
  ) {}

  emit<T = unknown>(type: string, payload: T): void {
    void this.ctx.adapter.publish("__pp_broadcast", {
      type: "__pp_remote_emit",
      payload: {
        rooms: this.targetRoom !== null ? [this.targetRoom] : null,
        excludeId: this.excludeId,
        type,
        emitPayload: payload
      }
    });
  }

  send<T = unknown>(message: PPMessage<T>): void {
    this.emit(message.type, message.payload);
  }

  emitDelta<T = unknown>(type: string, prev: T, next: T, diffAlgorithm?: PPDiffAlgorithm): void {
    const d = computeDiff(prev, next, diffAlgorithm ?? "deep");
    if (d !== undefined) {
      this.emit(type, d);
    }
  }
}

// ---- Server-level Room Broadcaster (server.in / server.to / server.except) ----

class PPServerRoomBroadcaster implements PPServerBroadcastTarget {
  constructor(
    private readonly ctx: SocketServerContext,
    private readonly targetRooms: string[],     // empty = all clients
    private readonly exceptRooms: string[] = [],
    private readonly targetAll: boolean = false, // true when created by server.except()
  ) {}

  emit<T = unknown>(type: string, payload: T): void {
    void this.ctx.adapter.publish("__pp_broadcast", {
      type: "__pp_remote_emit",
      payload: {
        rooms: this.targetAll ? null : this.targetRooms,
        exceptRooms: this.exceptRooms,
        excludeId: null,
        type,
        emitPayload: payload
      }
    });
  }

  send<T = unknown>(message: PPMessage<T>): void {
    this.emit(message.type, message.payload);
  }

  emitDelta<T = unknown>(type: string, prev: T, next: T, diffAlgorithm?: PPDiffAlgorithm): void {
    const d = computeDiff(prev, next, diffAlgorithm ?? "deep");
    if (d !== undefined) {
      this.emit(type, d);
    }
  }

  async fetchSockets(): Promise<PPClientSocket[]> {
    const ids = await this.resolveIds();
    const result: PPClientSocket[] = [];
    for (const id of ids) {
      const c = this.ctx.clients.get(id);
      if (c) result.push(c);
    }
    return result;
  }

  async disconnectSockets(close = true): Promise<void> {
    const sockets = await this.fetchSockets();
    for (const s of sockets) s.close(close ? 1000 : undefined, "Disconnected by server");
  }

  except(roomId: string | string[]): PPServerBroadcastTarget {
    const extra = Array.isArray(roomId) ? roomId : [roomId];
    return new PPServerRoomBroadcaster(this.ctx, this.targetRooms, [...this.exceptRooms, ...extra], this.targetAll);
  }

  private async resolveIds(): Promise<Set<string>> {
    // Collect excluded IDs first
    const excluded = new Set<string>();
    for (const room of this.exceptRooms) {
      const ids = await this.ctx.adapter.getClientsInRoom(room);
      for (const id of ids) excluded.add(id);
    }

    if (this.targetAll) {
      // server.except() — all connected clients minus excluded rooms
      const all = new Set<string>();
      for (const id of this.ctx.clients.keys()) {
        if (!excluded.has(id)) all.add(id);
      }
      return all;
    }

    // Collect target IDs from rooms
    const target = new Set<string>();
    for (const room of this.targetRooms) {
      const ids = await this.ctx.adapter.getClientsInRoom(room);
      for (const id of ids) {
        if (!excluded.has(id)) target.add(id);
      }
    }
    return target;
  }
}

// ---- Timeout Emitter ----

class PPSocketTimeoutEmitter implements PPTimeoutEmitter {
  constructor(
    private readonly socket: PPClientSocketImpl,
    private readonly ms: number,
  ) {}

  emit<T = unknown>(type: string, payload: T, callback: (err: Error | null, ...args: unknown[]) => void): void {
    const ackId = ++serverAckCounter;
    const msg = { type, payload: payload as unknown, __ackId: ackId } as PPMessage & { __ackId: number };

    const timer = setTimeout(() => {
      this.socket._pendingAcks.delete(ackId);
      callback(new Error(`Ack timeout after ${this.ms}ms for "${type}"`));
    }, this.ms);

    this.socket._pendingAcks.set(ackId, { timer, callback });
    this.socket.send(msg as PPMessage);
  }
}

let serverAckCounter = 0;

// ---- Rate Limiter ----

interface RateLimitEntry {
  /** Fixed-window: count in current window. */
  secCount: number;
  secResetAt: number;
  /** Per-minute tracking. */
  minCount: number;
  minResetAt: number;
  /** Sliding-window: timestamps of recent messages. */
  timestamps?: number[];
}

class PPRateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private config: Required<Pick<PPRateLimitConfig, "maxPerSecond" | "maxPerMinute" | "strategy">>;
  private onLimit?: (socket: PPClientSocket) => void;
  private nsOverrides: Record<string, { maxPerSecond?: number; maxPerMinute?: number }>;

  constructor(config: PPRateLimitConfig) {
    this.config = {
      maxPerSecond: config.maxPerSecond ?? 0,
      maxPerMinute: config.maxPerMinute ?? 0,
      strategy: config.strategy ?? "fixed-window",
    };
    this.onLimit = config.onLimit;
    this.nsOverrides = config.namespaceOverrides ?? {};
  }

  /** Returns true if the message is allowed, false if rate-limited. */
  check(socket: PPClientSocket, namespace?: string): boolean {
    const now = Date.now();
    const maxSec = this.nsOverrides[namespace ?? "/"]?.maxPerSecond ?? this.config.maxPerSecond;
    const maxMin = this.nsOverrides[namespace ?? "/"]?.maxPerMinute ?? this.config.maxPerMinute;

    if (maxSec === 0 && maxMin === 0) return true;

    let entry = this.entries.get(socket.id);
    if (!entry) {
      entry = { secCount: 0, secResetAt: now + 1000, minCount: 0, minResetAt: now + 60_000 };
      if (this.config.strategy === "sliding-window") entry.timestamps = [];
      this.entries.set(socket.id, entry);
    }

    if (this.config.strategy === "sliding-window") {
      // Sliding window — keep timestamps, filter to window
      entry.timestamps!.push(now);

      if (maxSec > 0) {
        const secWindow = entry.timestamps!.filter((t) => now - t < 1000);
        entry.timestamps = secWindow;
        if (secWindow.length > maxSec) {
          this.onLimit?.(socket);
          return false;
        }
      }

      if (maxMin > 0) {
        const minWindow = entry.timestamps!.filter((t) => now - t < 60_000);
        if (minWindow.length > maxMin) {
          this.onLimit?.(socket);
          return false;
        }
      }

      return true;
    }

    // Fixed-window
    if (now >= entry.secResetAt) {
      entry.secCount = 0;
      entry.secResetAt = now + 1000;
    }
    if (now >= entry.minResetAt) {
      entry.minCount = 0;
      entry.minResetAt = now + 60_000;
    }

    entry.secCount++;
    entry.minCount++;

    if (maxSec > 0 && entry.secCount > maxSec) {
      this.onLimit?.(socket);
      return false;
    }
    if (maxMin > 0 && entry.minCount > maxMin) {
      this.onLimit?.(socket);
      return false;
    }

    return true;
  }

  remove(id: string): void {
    this.entries.delete(id);
  }
}

// ---- Client Socket Implementation ----

class PPClientSocketImpl implements PPClientSocket {
  readonly id: string;
  private ws: WebSocket;
  private mode: PPMode;
  private registry?: PPSchemaRegistry;
  private maxDecompressedSize: number;
  private listeners = new Map<string, Set<EventHandler>>();
  private anyListeners: Set<(event: string, ...args: unknown[]) => void> = new Set();
  private _ctx!: SocketServerContext;
  private _rooms: Set<string> = new Set();

  data: Record<string, unknown> = {};
  private tags = new Map<string, string>();
  /** Pending ack callbacks registered via socket.timeout(ms).emit() */
  readonly _pendingAcks = new Map<number, { timer: ReturnType<typeof setTimeout>; callback: (err: Error | null, ...args: unknown[]) => void }>();

  constructor(ws: WebSocket, mode: PPMode, registry?: PPSchemaRegistry, existingId?: string, maxDecompressedSize = 10_485_760) {
    this.id = existingId ?? crypto.randomUUID();
    this.ws = ws;
    this.mode = mode;
    this.registry = registry;
    this.maxDecompressedSize = maxDecompressedSize;

    this.ws.on("message", (data: RawData, isBinary: boolean) => {
      try {
        if (isBinary || data instanceof Buffer || data instanceof Uint8Array || data instanceof ArrayBuffer) {
          const buf = data instanceof Buffer ? new Uint8Array(data.buffer, data.byteOffset, data.length) : data;
          const { message } = decodeFrame(buf as Uint8Array | ArrayBuffer, this.registry, this.maxDecompressedSize);
          this._emit("message", message);
        } else {
          const text = data.toString();
          const message = JSON.parse(text) as PPMessage;
          this._emit("message", message);
        }
      } catch (err) {
        this._emit("error", new PPError("DECODE_ERROR", (err as Error).message, { clientId: this.id }));
      }
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this._emit("close", code, reason.toString());
    });

    this.ws.on("error", (err: Error) => {
      this._emit("error", new PPError("CONNECTION_ERROR", err.message, { clientId: this.id }));
    });
  }

  /** Send a PPMessage (binary-encoded). */
  send<T = unknown>(message: PPMessage<T>): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry, this._ctx?.encodeOpts);
    this.ws.send(frame);
  }

  /** DX shorthand: socket.emit("chat", { text: "hi" }) */
  emit<T = unknown>(type: string, payload: T): void {
    this.send({ type, payload });
  }

  sendRaw(frame: Uint8Array): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(frame);
  }

  close(code?: number, reason?: string): void {
    this.ws.close(code, reason);
  }

  setTag(key: string, value: string): void { this.tags.set(key, value); }
  getTag(key: string): string | undefined { return this.tags.get(key); }
  hasTag(key: string, value?: string): boolean {
    if (value !== undefined) return this.tags.get(key) === value;
    return this.tags.has(key);
  }
  removeTag(key: string): void { this.tags.delete(key); }
  getAllTags(): Map<string, string> { return new Map(this.tags); }

  // ---- Room API ----

  /** Called by PPServer right after construction to wire the socket to the server context. */
  _attachContext(ctx: SocketServerContext): void { this._ctx = ctx; }

  async join(roomId: string): Promise<void> {
    await this._ctx.adapter.addToRoom(roomId, this.id);
    this._rooms.add(roomId);
  }

  async leave(roomId: string): Promise<void> {
    await this._ctx.adapter.removeFromRoom(roomId, this.id);
    this._rooms.delete(roomId);
  }

  get rooms(): Set<string> { return new Set(this._rooms); }

  to(roomId: string): PPBroadcastTarget {
    return new PPBroadcastOperator(this._ctx, roomId, this.id);
  }

  get broadcast(): PPBroadcastTarget {
    return new PPBroadcastOperator(this._ctx, null, this.id);
  }

  /**
   * Set a per-emit ack timeout. Returns a one-shot emitter.
   * @example socket.timeout(3000).emit("save", data, (err, result) => { ... })
   */
  timeout(ms: number): PPTimeoutEmitter {
    return new PPSocketTimeoutEmitter(this, ms);
  }

  /** Internal: resolve a pending timeout-ack. Called by the message handler when __pp_ack arrives. */
  _resolveTimeoutAck(ackId: number, args: unknown[]): boolean {
    const pending = this._pendingAcks.get(ackId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this._pendingAcks.delete(ackId);
    pending.callback(null, ...args);
    return true;
  }

  /** Internal: called by PPServer on disconnect to clear adapter membership. */
  async _leaveAllAdapterRooms(): Promise<void> {
    const rooms = [...this._rooms];
    this._rooms.clear();
    await Promise.all(rooms.map((r) => this._ctx.adapter.removeFromRoom(r, this.id)));
  }

  // ---- Event API ----

  on<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  on(event: string, listener: (payload: unknown) => void): void;
  on(event: string, listener: EventHandler): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as EventHandler);
  }

  /** Listen once, then auto-remove. */
  once<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  once(event: string, listener: (payload: unknown) => void): void;
  once(event: string, listener: EventHandler): void {
    const wrapped = ((...args: unknown[]) => {
      this.off(event, wrapped as any);
      listener(...args);
    }) as EventHandler;
    this.on(event, wrapped);
  }

  off<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  off(event: string, listener: (payload: unknown) => void): void;
  off(event: string, listener: EventHandler): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as EventHandler);
      if (set.size === 0) this.listeners.delete(event);
    }
  }

  onAny(listener: (event: string, ...args: unknown[]) => void): void { this.anyListeners.add(listener); }
  offAny(listener: (event: string, ...args: unknown[]) => void): void { this.anyListeners.delete(listener); }

  /** Internal emit — fires handlers. Public emit() is the send shorthand. */
  _emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) handler(...args);
    }
    for (const handler of this.anyListeners) handler(event, ...args);
  }
}

// ---- PPServer ----

/**
 * @template TClientEvents  Events the server receives from clients (client → server payload shapes).
 * @template TServerEvents  Events the server sends to clients (server → client payload shapes).
 *
 * @example
 * ```ts
 * interface ClientEvents { move: { x: number; y: number } }
 * interface ServerEvents { state: GameState; chat: string }
 *
 * const server = new PPServer<ClientEvents, ServerEvents>({ port: 3000 });
 * server.on("connection", (socket) => {
 *   socket.on("move", (data) => { ... });  // data: { x: number; y: number }
 *   socket.emit("chat", "Hello!");          // type-checked
 * });
 * ```
 */
export class PPServer<
  TClientEvents extends Record<string, unknown> = Record<string, unknown>,
  TServerEvents extends Record<string, unknown> = Record<string, unknown>,
> {
  private wss: WebSocketServer;
  private mode: PPMode;
  private registry?: PPSchemaRegistry;
  private clients = new Map<string, PPClientSocketImpl>();
  private listeners = new Map<string, Set<EventHandler>>();
  private anyListeners: Set<(event: string, ...args: unknown[]) => void> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private namespaces = new Map<string, PPNamespace>();
  private pipeline = new PPMiddlewarePipeline();
  private recovery: PPRecoveryManager | null = null;
  private adapter: PPAdapter;
  private pluginManager = new PPPluginManager();
  private roomManager = new PPRoomManager();
  readonly presence: PPPresence;

  // Rate limiting
  private rateLimiter: PPRateLimiter | null = null;

  // Security: IP connection tracking
  private ipConnections = new Map<string, number>();
  private maxConnectionsPerIp: number;
  private maxDecompressedSize: number;
  private recoverySecret: string | null;

  // Logger
  readonly log: PPLogger;

  // Config
  readonly config: {
    heartbeat: PPHeartbeatConfig | false;
    compression: PPCompressionConfig;
    rateLimit: PPRateLimitConfig;
  };

  private readonly encodeOpts: EncodeOptions;

  /**
   * Attach a PPServer to an existing HTTP/HTTPS server.
   * This is the recommended way to share a port between Express/Fastify and PP.
   *
   * @example
   * ```ts
   * import express from "express";
   * import { createServer } from "http";
   * import { PPServer } from "@painda/core";
   *
   * const app = express();
   * const httpServer = createServer(app);
   *
   * const pp = PPServer.attachTo(httpServer, { recovery: true });
   *
   * httpServer.listen(3009); // Both Express and PP on port 3009
   * ```
   */
  static attachTo(
    httpServer: import("http").Server | import("https").Server,
    options: Omit<PPServerOptions, "port" | "server"> = {},
  ): PPServer {
    return new PPServer({ ...options, server: httpServer });
  }

  /**
   * Inject a headless PPVirtualClient directly into the server pipeline,
   * bypassing the WebSocket and HTTP layer. Useful for bots, testing, and SSR.
   */
  inject(client: PPVirtualClient): void {
    const fakeWs = new EventEmitter() as any;
    fakeWs.send = (data: Uint8Array) => client._receiveRaw(data);
    fakeWs.close = () => client._handleClose();
    fakeWs.on = fakeWs.addListener.bind(fakeWs); // Satisfy WebSocket event handlers

    client._attachServer(fakeWs);

    // Simulate standard connection
    this.wss.emit("connection", fakeWs, {
      headers: { "x-forwarded-for": "127.0.0.1", host: "localhost" },
      url: "/?pp_is_virtual=1",
      socket: { remoteAddress: "127.0.0.1" }
    });
  }

  /**
   * Internal: Handle cross-node broadcasts from the PPAdapter
   */
  private async _handleRemoteBroadcast(msg: PPMessage): Promise<void> {
    if (msg.type !== "__pp_remote_emit" || !msg.payload) return;
    const { rooms, exceptRooms, excludeId, type, emitPayload } = msg.payload as any;

    const frame = encodeFrame(this.mode, { type, payload: emitPayload }, this.registry, this.encodeOpts);

    // Filter out excluded rooms
    const excludedIds = new Set<string>();
    if (exceptRooms && exceptRooms.length > 0) {
      for (const room of exceptRooms) {
        const ids = await this.adapter.getClientsInRoom(room);
        for (const id of ids) excludedIds.add(id);
      }
    }

    if (rooms === null) {
      // Broadcast to all clients
      for (const id of this.clients.keys()) {
        if (id === excludeId || excludedIds.has(id)) continue;
        this.clients.get(id)?.sendRaw(frame);
      }
      return;
    }

    // specific rooms
    const targetIds = new Set<string>();
    for (const room of rooms) {
      const ids = await this.adapter.getClientsInRoom(room);
      for (const id of ids) {
        if (!excludedIds.has(id)) targetIds.add(id);
      }
    }

    for (const id of targetIds) {
      if (id === excludeId) continue;
      this.clients.get(id)?.sendRaw(frame);
    }
  }

  constructor(options: PPServerOptions) {
    this.mode = options.mode ?? "chat";
    this.registry = options.registry;
    this.adapter = options.adapter ?? new InMemoryAdapter();
    this.log = createLogger(options.logger);
    this.presence = new PPPresence(options.presence);

    // Resolve config (backward-compatible)
    const heartbeat = options.heartbeat !== undefined
      ? options.heartbeat
      : { interval: options.heartbeatInterval ?? 30_000, timeout: 10_000 };

    const rateLimit: PPRateLimitConfig = options.rateLimit ?? (
      options.maxMessagesPerSecond ? { maxPerSecond: options.maxMessagesPerSecond } : {}
    );

    const compression: PPCompressionConfig = options.compression ?? {};

    this.config = { heartbeat, compression, rateLimit };

    // Compression encode options — computed once, passed to every encodeFrame call
    this.encodeOpts = compression.algorithm !== "none" && (compression.threshold !== undefined || compression.algorithm === "deflate")
      ? { compress: true, compressionThreshold: compression.threshold ?? 1024 }
      : {};

    // Security config
    this.maxConnectionsPerIp = options.maxConnectionsPerIp ?? 50;
    this.maxDecompressedSize = options.maxDecompressedSize ?? 10_485_760;
    this.recoverySecret = options.recoverySecret ?? null;

    // Setup rate limiter
    if (rateLimit.maxPerSecond || rateLimit.maxPerMinute) {
      this.rateLimiter = new PPRateLimiter(rateLimit);
    }

    // Setup recovery
    if (options.recovery) {
      this.recovery = new PPRecoveryManager(
        typeof options.recovery === "object" ? options.recovery : undefined,
      );
    }

    this.namespaces.set("/", new PPNamespace("/"));

    // Validate: either port or server must be provided
    if (options.port === undefined && !options.server) {
      throw new Error("PPServer: either 'port' or 'server' must be provided in options.");
    }

    // Security: maxPayload limits frame size (default 1MB)
    const maxPayload = options.maxPayload ?? 1_048_576;

    // Security: Origin whitelist via verifyClient
    const allowedOrigins = options.allowedOrigins;
    const verifyClient = allowedOrigins && allowedOrigins.length > 0
      ? (info: { origin: string; req: any }) => {
        const origin = info.origin || info.req.headers.origin;
        if (!origin) return true; // Allow non-browser clients (no origin header)
        return allowedOrigins.includes(origin);
      }
      : undefined;

    // Create WebSocketServer — either on its own port or attached to an existing HTTP server
    const wssOptions = options.server
      ? { server: options.server, maxPayload, perMessageDeflate: false as const, ...(verifyClient ? { verifyClient } : {}) }
      : { port: options.port!, host: options.host, maxPayload, perMessageDeflate: false as const, ...(verifyClient ? { verifyClient } : {}) };

    this.wss = new WebSocketServer(wssOptions);

    if (options.server) {
      this.log.info(`Server attached to existing HTTP server (maxPayload: ${maxPayload})`);
    } else {
      this.log.info(`Server starting on port ${options.port} (maxPayload: ${maxPayload})`);
    }

    // Subscribe to multi-node adapter broadcasts
    void this.adapter.subscribe("__pp_broadcast", (msg) => {
      this._handleRemoteBroadcast(msg);
    });

    this.wss.on("connection", async (ws: WebSocket, req) => {
      // Security: IP-based connection rate limiting
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim()
        ?? req.socket.remoteAddress ?? "unknown";

      if (this.maxConnectionsPerIp > 0) {
        const current = this.ipConnections.get(ip) ?? 0;
        if (current >= this.maxConnectionsPerIp) {
          this.log.warn(`IP ${ip} exceeded max connections (${this.maxConnectionsPerIp})`);
          ws.close(4029, "Too many connections from this IP");
          return;
        }
        this.ipConnections.set(ip, current + 1);
      }

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const recoverySid = url.searchParams.get("pp_sid");
      const recoveryOffset = parseInt(url.searchParams.get("pp_offset") ?? "-1", 10);

      const client = new PPClientSocketImpl(ws, this.mode, this.registry, recoverySid ?? undefined, this.maxDecompressedSize);
      client._attachContext({ adapter: this.adapter, clients: this.clients, mode: this.mode, registry: this.registry, encodeOpts: this.encodeOpts });
      this.clients.set(client.id, client);
      this.log.debug("Client connected:", client.id);

      // Heartbeat tracking
      (ws as any).__ppAlive = true;
      (ws as any).__ppLastPong = Date.now();
      ws.on("pong", () => {
        (ws as any).__ppAlive = true;
        (ws as any).__ppLastPong = Date.now();
      });

      // Global middleware
      try {
        await this.pipeline.runConnection(client);
      } catch (err) {
        this.log.warn("Middleware rejected client:", client.id, (err as Error).message);
        client.send({
          type: "__pp_error",
          payload: { code: "MIDDLEWARE_ERROR", message: (err as Error).message },
        });
        client.close(4003, "Middleware rejected");
        this.clients.delete(client.id);
        return;
      }

      // Plugin hook: onConnect
      await this.pluginManager.dispatchConnect(client);

      // Recovery
      if (this.recovery && recoverySid && recoveryOffset >= 0) {
        // Security: Verify recovery session ownership via HMAC
        const recoveryToken = url.searchParams.get("pp_rtoken");
        if (this.recoverySecret) {
          const expectedToken = crypto
            .createHmac("sha256", this.recoverySecret)
            .update(recoverySid)
            .digest("hex")
            .slice(0, 16);
          if (recoveryToken !== expectedToken) {
            this.log.warn("Recovery session verification failed for", recoverySid);
            client.send({
              type: "__pp_error",
              payload: { code: "RECOVERY_AUTH_ERROR", message: "Invalid recovery token" },
            });
            // Continue without recovery — don't disconnect
          } else {
            this.replayRecovery(client, recoverySid, recoveryOffset);
          }
        } else {
          // No secret configured — allow recovery without verification (backward-compatible)
          this.replayRecovery(client, recoverySid, recoveryOffset);
        }
      }

      if (this.recovery) {
        this.recovery.track(client.id);
        // Generate recovery token if secret is configured
        let rtoken: string | undefined;
        if (this.recoverySecret) {
          rtoken = crypto
            .createHmac("sha256", this.recoverySecret)
            .update(client.id)
            .digest("hex")
            .slice(0, 16);
        }
        client.send({ type: "__pp_session", payload: { sid: client.id, offset: 0, ...(rtoken ? { rtoken } : {}) } });
      }

      // Message routing
      client.on("message", async (msg: PPMessage) => {
        // Security: Handle auth token from first frame
        if (msg.type === "__pp_auth") {
          const { token } = msg.payload as { token: string };
          if (token && typeof token === "string") {
            client.data.__ppAuthToken = token;
            this.log.debug("Auth token received for", client.id);
          }
          return;
        }
        // Rate limiting
        if (this.rateLimiter) {
          const ns = (msg as any).__ns ?? "/";
          if (!this.rateLimiter.check(client, ns)) {
            client.send({
              type: "__pp_error",
              payload: { code: "RATE_LIMIT_ERROR", message: "Rate limit exceeded" },
            });
            return;
          }
        }

        // Plugin hook: onMessage
        const allowed = await this.pluginManager.dispatchMessage(client, msg);
        if (!allowed) return;

        // Ack responses
        if (msg.type === "__pp_ack") {
          const { ackId, args } = msg.payload as { ackId: number; args: any[] };
          // Resolve timeout-based ack (socket.timeout().emit())
          if (client._resolveTimeoutAck(ackId, args ?? [])) return;
          // Resolve namespace ack
          const nsName = (msg as any).__ns ?? "/";
          const ns = this.namespaces.get(nsName);
          if (ns) {
            const nsSocket = ns.getSocket(client.id);
            nsSocket?.resolveAck(ackId, ...args);
          }
          return;
        }

        // Route to namespace
        const nsName = (msg as any).__ns ?? "/";
        const ns = this.namespaces.get(nsName);
        if (!ns) {
          client.send({
            type: "__pp_error",
            payload: { code: "NAMESPACE_ERROR", message: `Unknown namespace: ${nsName}` },
          });
          return;
        }

        // Message middleware
        try {
          await ns.runMessageMiddleware(client, msg);
        } catch (err) {
          client.send({
            type: "__pp_error",
            payload: { code: "MIDDLEWARE_ERROR", message: (err as Error).message },
          });
          return;
        }

        const nsSocket = ns.getSocket(client.id);
        if (nsSocket) nsSocket.emit(msg.type, msg);

        // Fire typed event directly on socket (socket.on("chat", handler) pattern)
        if (!msg.type.startsWith("__pp_")) {
          client._emit(msg.type, msg.payload);
        }
      });

      client.on("close", async () => {
        this.log.debug("Client disconnected:", client.id);
        this.clients.delete(client.id);
        this.rateLimiter?.remove(client.id);
        void client._leaveAllAdapterRooms();

        // Security: Decrement IP connection count
        if (this.maxConnectionsPerIp > 0) {
          const current = this.ipConnections.get(ip) ?? 1;
          if (current <= 1) this.ipConnections.delete(ip);
          else this.ipConnections.set(ip, current - 1);
        }

        await this.pluginManager.dispatchDisconnect(client);
        this.presence.untrack(client);
        this.roomManager.leaveAll(client);

        if (this.recovery) this.recovery.markDisconnected(client.id);

        for (const [, ns] of this.namespaces) ns.removeSocket(client.id);

        this.emit("disconnection", client);
      });

      // Add to default namespace
      const defaultNs = this.namespaces.get("/")!;
      try {
        await defaultNs.runConnectionMiddleware(client);
        defaultNs.addSocket(client);
      } catch (err) {
        client.close(4003, "Namespace middleware rejected");
        this.clients.delete(client.id);
        return;
      }

      this.emit("connection", client);
    });

    this.wss.on("error", (err: Error) => {
      this.log.error("Server error:", err.message);
      this.pluginManager.dispatchError(err);
      this.emit("error", err);
    });

    this.wss.on("close", () => {
      this.log.info("Server closed");
      this.emit("close");
    });

    // Heartbeat with configurable timeout
    if (heartbeat !== false) {
      const hbInterval = heartbeat.interval ?? 30_000;
      const hbTimeout = heartbeat.timeout ?? 10_000;
      const hbOnTimeout = heartbeat.onTimeout;

      if (hbInterval > 0) {
        this.heartbeatTimer = setInterval(() => {
          const now = Date.now();
          for (const ws of this.wss.clients) {
            const lastPong = (ws as any).__ppLastPong ?? now;

            if ((ws as any).__ppAlive === false && now - lastPong > hbTimeout) {
              if (hbOnTimeout) {
                // Find the client socket for custom handler
                for (const [, c] of this.clients) {
                  if ((c as any).ws === ws) {
                    hbOnTimeout(c);
                    break;
                  }
                }
              }
              ws.terminate();
              continue;
            }

            (ws as any).__ppAlive = false;
            ws.ping();
          }
        }, hbInterval);
      }
    }
  }

  // ---- Namespace API ----

  of(name: string): PPNamespace {
    if (!this.namespaces.has(name)) this.namespaces.set(name, new PPNamespace(name));
    return this.namespaces.get(name)!;
  }

  // ---- Middleware API ----

  use(fn: PPConnectionMiddleware): this {
    this.pipeline.useConnection(fn);
    return this;
  }

  useMessage(fn: PPMessageMiddleware): this {
    this.pipeline.useMessage(fn);
    return this;
  }

  // ---- Plugin API ----

  register<TOptions = unknown>(plugin: PPPlugin<TOptions>, options?: TOptions): this {
    const pluginLog = this.log.child(plugin.name);
    const ctx: PPPluginContext = {
      use: (fn) => this.use(fn),
      useMessage: (fn) => this.useMessage(fn),
      on: (event, handler) => this.on(event as any, handler as any),
      getPlugin: (name) => this.pluginManager.getPluginApi(name),
      expose: () => { },
      broadcast: (msg, exclude) => this.broadcast(msg, exclude),
      getClientCount: () => this.clients.size,
      getClient: (id) => this.clients.get(id),
      log: (...args) => pluginLog.info(...args),
    };
    this.pluginManager.register(plugin as PPPlugin, ctx, options);
    this.log.info(`Plugin registered: ${plugin.name}@${plugin.version}`);
    return this;
  }

  hasPlugin(name: string): boolean { return this.pluginManager.has(name); }
  getPluginNames(): string[] { return this.pluginManager.getNames(); }

  getPlugin<T = unknown>(name: string): T | undefined {
    return this.pluginManager.getPluginApi<T>(name);
  }

  // ---- Typed Rooms API ----

  room<TState extends object>(
    id: string,
    initialState: TState,
    options?: TypedRoomOptions,
  ): PPTypedRoom<TState> {
    const room = this.roomManager.room(id, initialState, options);
    // Wire room events to plugin hooks
    room.on("join", ((...args: unknown[]) => {
      const client = args[0] as PPClientSocket;
      this.pluginManager.dispatchRoomJoin(client, id);
      this.emit("roomJoin", client, id);
    }));
    room.on("leave", ((...args: unknown[]) => {
      const client = args[0] as PPClientSocket;
      this.pluginManager.dispatchRoomLeave(client, id);
      this.emit("roomLeave", client, id);
    }));
    return room;
  }

  getRoom<TState extends object>(id: string): PPTypedRoom<TState> | undefined {
    return this.roomManager.get<TState>(id);
  }

  deleteRoom(id: string): boolean { return this.roomManager.delete(id); }
  getRoomIds(): string[] { return this.roomManager.getRoomIds(); }

  // ---- to(room) / in(room) / except(room) — Socket.io-style API ----

  /**
   * Broadcast to all sockets in the specified room.
   * Also checks PPTypedRoom if a generic adapter room is not found.
   * @example server.to("game-1").emit("update", delta)
   */
  to(roomId: string | string[]): PPServerBroadcastTarget {
    const rooms = Array.isArray(roomId) ? roomId : [roomId];
    return new PPServerRoomBroadcaster(
      { adapter: this.adapter, clients: this.clients, mode: this.mode, registry: this.registry, encodeOpts: this.encodeOpts },
      rooms,
    );
  }

  /**
   * Alias for `to()` — matches Socket.io's `io.in("room")` pattern.
   * @example server.in("game-1").fetchSockets()
   */
  in(roomId: string | string[]): PPServerBroadcastTarget {
    return this.to(roomId);
  }

  /**
   * Broadcast to ALL connected clients EXCEPT those in the specified room(s).
   * @example server.except("admins").emit("announcement", msg)
   */
  except(roomId: string | string[]): PPServerBroadcastTarget {
    const rooms = Array.isArray(roomId) ? roomId : [roomId];
    return new PPServerRoomBroadcaster(
      { adapter: this.adapter, clients: this.clients, mode: this.mode, registry: this.registry, encodeOpts: this.encodeOpts },
      [],
      rooms,
      true,
    );
  }

  // ---- Client Query API ----

  getClient(id: string): PPClientSocketImpl | undefined { return this.clients.get(id); }
  getClients(): PPClientSocket[] { return [...this.clients.values()]; }

  getClientsByTag(key: string, value: string): PPClientSocketImpl[] {
    const result: PPClientSocketImpl[] = [];
    for (const [, client] of this.clients) {
      if (client.hasTag(key, value)) result.push(client);
    }
    return result;
  }

  broadcastToTag<T = unknown>(key: string, value: string, message: PPMessage<T>, exclude?: PPClientSocket): void {
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry, this.encodeOpts);
    for (const [, client] of this.clients) {
      if (exclude && client.id === exclude.id) continue;
      if (client.hasTag(key, value)) client.sendRaw(frame);
    }
  }

  // ---- Broadcast ----

  broadcast<T = unknown>(message: PPMessage<T>, exclude?: PPClientSocket): void {
    const transformed = this.pluginManager.dispatchSend(exclude as PPClientSocket, message as PPMessage);
    const frame = encodeFrame(this.mode, transformed, this.registry, this.encodeOpts);
    for (const [id, client] of this.clients) {
      if (exclude && id === exclude.id) continue;
      client.sendRaw(frame);
      if (this.recovery) this.recovery.bufferMessage(id, transformed);
    }
  }

  broadcastVolatile<T = unknown>(message: PPMessage<T>, exclude?: PPClientSocket): void {
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry, this.encodeOpts);
    for (const [id, client] of this.clients) {
      if (exclude && id === exclude.id) continue;
      try { client.sendRaw(frame); } catch { /* volatile */ }
    }
  }

  // ---- Shutdown ----

  async close(code = 1001, reason = "Server shutting down"): Promise<void> {
    this.log.info("Server shutting down...");
    await this.pluginManager.dispatchShutdown();
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.recovery) this.recovery.close();
    this.presence.dispose();
    this.roomManager.dispose();
    this.adapter.close();
    for (const [, client] of this.clients) client.close(code, reason);
    this.wss.close();
  }

  /** Graceful shutdown: wait for pending ops, then close. */
  async gracefulShutdown(timeoutMs = 5000, code = 1001, reason = "Server shutting down"): Promise<void> {
    this.log.info(`Graceful shutdown (${timeoutMs}ms timeout)...`);

    // Notify all clients
    for (const [, client] of this.clients) {
      try { client.send({ type: "__pp_shutdown", payload: { reason, timeoutMs } }); } catch { /* ignore */ }
    }

    // Wait for timeout or until all clients disconnect
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.clients.size === 0) { clearInterval(check); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(check); resolve(); }, timeoutMs);
    });

    await this.close(code, reason);
  }

  /** Replay recovery messages for a reconnecting client. */
  private async replayRecovery(client: PPClientSocket, sid: string, offset: number): Promise<void> {
    if (!this.recovery) return;
    const recovered = this.recovery.recover(sid, offset);
    if (recovered) {
      this.log.info("Recovery for", client.id, `- ${recovered.messages.length} messages`);
      for (const room of recovered.rooms) {
        await this.adapter.addToRoom(room, client.id);
      }
      client.send({
        type: "__pp_recovery",
        payload: {
          sid: client.id,
          offset: this.recovery.getOffset(client.id),
          recovered: true,
          missedCount: recovered.messages.length,
        },
      });
      for (const msg of recovered.messages) client.send(msg);
    }
  }

  // ---- Stats / Metrics ----

  get clientCount(): number { return this.clients.size; }

  getStats(): {
    clients: number;
    rooms: number;
    namespaces: number;
    plugins: number;
    presenceTracked: number;
    uptime: number;
  } {
    return {
      clients: this.clients.size,
      rooms: this.roomManager.size,
      namespaces: this.namespaces.size,
      plugins: this.pluginManager.getNames().length,
      presenceTracked: this.presence.list().length,
      uptime: process.uptime(),
    };
  }

  // ---- Event System ----

  on<K extends keyof PPServerEventMap<TClientEvents, TServerEvents>>(
    event: K,
    listener: PPServerEventMap<TClientEvents, TServerEvents>[K],
  ): void {
    if (!this.listeners.has(event as string)) this.listeners.set(event as string, new Set());
    this.listeners.get(event as string)!.add(listener as EventHandler);
  }

  /** Listen once, then auto-remove. */
  once<K extends keyof PPServerEventMap<TClientEvents, TServerEvents>>(
    event: K,
    listener: PPServerEventMap<TClientEvents, TServerEvents>[K],
  ): void {
    const wrapped = ((...args: unknown[]) => {
      this.off(event, wrapped as any);
      (listener as EventHandler)(...args);
    }) as PPServerEventMap<TClientEvents, TServerEvents>[K];
    this.on(event, wrapped);
  }

  off<K extends keyof PPServerEventMap<TClientEvents, TServerEvents>>(
    event: K,
    listener: PPServerEventMap<TClientEvents, TServerEvents>[K],
  ): void {
    const set = this.listeners.get(event as string);
    if (set) {
      set.delete(listener as EventHandler);
      if (set.size === 0) this.listeners.delete(event as string);
    }
  }

  onAny(listener: (event: string, ...args: unknown[]) => void): void { this.anyListeners.add(listener); }
  offAny(listener: (event: string, ...args: unknown[]) => void): void { this.anyListeners.delete(listener); }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) { for (const handler of handlers) handler(...args); }
    for (const handler of this.anyListeners) handler(event, ...args);
  }
}
