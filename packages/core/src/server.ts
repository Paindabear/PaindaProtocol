import { WebSocketServer, WebSocket, type RawData } from "ws";
import crypto from "node:crypto";
import { encodeFrame, decodeFrame } from "./frame.js";
import type { PPSchemaRegistry } from "./schema.js";
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
} from "./types.js";
import { PPNamespace, type PPNamespacedSocket, type PPAckMessage } from "./namespace.js";
import { PPMiddlewarePipeline, type PPConnectionMiddleware, type PPMessageMiddleware } from "./middleware.js";
import { PPRecoveryManager, type RecoveryOptions } from "./recovery.js";
import { PPError } from "./errors.js";
import { InMemoryAdapter, type PPAdapter } from "./adapter.js";
import { PPPluginManager, type PPPlugin, type PPPluginContext } from "./plugin.js";
import { PPRoomManager, type PPTypedRoom, type TypedRoomOptions } from "./typed-room.js";
import { PPPresence, type PresenceOptions } from "./presence.js";
import { createLogger, type PPLogger } from "./logger.js";
import { sendTelemetryPing } from "./telemetry.js";

type EventHandler = (...args: unknown[]) => void;

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

  data: Record<string, unknown> = {};
  private tags = new Map<string, string>();

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
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry);
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

  on<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void {
    const key = event as string;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener as EventHandler);
  }

  /** Listen once, then auto-remove. */
  once<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void {
    const wrapped = ((...args: unknown[]) => {
      this.off(event, wrapped as any);
      (listener as EventHandler)(...args);
    }) as PPClientSocketEventMap[K];
    this.on(event, wrapped);
  }

  off<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void {
    const key = event as string;
    const set = this.listeners.get(key);
    if (set) {
      set.delete(listener as EventHandler);
      if (set.size === 0) this.listeners.delete(key);
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

export class PPServer {
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

    this.wss = new WebSocketServer({
      port: options.port,
      host: options.host,
      maxPayload,
      ...(verifyClient ? { verifyClient } : {}),
    });
    this.log.info(`Server starting on port ${options.port} (maxPayload: ${maxPayload})`);

    // Anonymous telemetry — fire-and-forget (opt-out: PAINDA_TELEMETRY_DISABLED=1)
    sendTelemetryPing();

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
      });

      client.on("close", async () => {
        this.log.debug("Client disconnected:", client.id);
        this.clients.delete(client.id);
        this.rateLimiter?.remove(client.id);

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

  // ---- to(room).emit() — Socket.io-style API ----

  to(roomId: string): { emit: <T>(type: string, payload: T) => void; broadcast: (msg: PPMessage, excludeId?: string) => void } {
    const room = this.roomManager.get(roomId);
    return {
      emit: <T>(type: string, payload: T) => {
        if (room) room.broadcast({ type, payload }, undefined);
      },
      broadcast: (msg: PPMessage, excludeId?: string) => {
        if (room) room.broadcast(msg, excludeId);
      },
    };
  }

  // ---- Client Query API ----

  getClient(id: string): PPClientSocketImpl | undefined { return this.clients.get(id); }

  getClientsByTag(key: string, value: string): PPClientSocketImpl[] {
    const result: PPClientSocketImpl[] = [];
    for (const [, client] of this.clients) {
      if (client.hasTag(key, value)) result.push(client);
    }
    return result;
  }

  broadcastToTag<T = unknown>(key: string, value: string, message: PPMessage<T>, exclude?: PPClientSocket): void {
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry);
    for (const [, client] of this.clients) {
      if (exclude && client.id === exclude.id) continue;
      if (client.hasTag(key, value)) client.sendRaw(frame);
    }
  }

  // ---- Broadcast ----

  broadcast<T = unknown>(message: PPMessage<T>, exclude?: PPClientSocket): void {
    const transformed = this.pluginManager.dispatchSend(exclude as PPClientSocket, message as PPMessage);
    const frame = encodeFrame(this.mode, transformed, this.registry);
    for (const [id, client] of this.clients) {
      if (exclude && id === exclude.id) continue;
      client.sendRaw(frame);
      if (this.recovery) this.recovery.bufferMessage(id, transformed);
    }
  }

  broadcastVolatile<T = unknown>(message: PPMessage<T>, exclude?: PPClientSocket): void {
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry);
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

  on<K extends keyof PPServerEventMap>(event: K, listener: PPServerEventMap[K]): void {
    const key = event as string;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener as EventHandler);
  }

  /** Listen once, then auto-remove. */
  once<K extends keyof PPServerEventMap>(event: K, listener: PPServerEventMap[K]): void {
    const wrapped = ((...args: unknown[]) => {
      this.off(event, wrapped as any);
      (listener as EventHandler)(...args);
    }) as PPServerEventMap[K];
    this.on(event, wrapped);
  }

  off<K extends keyof PPServerEventMap>(event: K, listener: PPServerEventMap[K]): void {
    const key = event as string;
    const set = this.listeners.get(key);
    if (set) {
      set.delete(listener as EventHandler);
      if (set.size === 0) this.listeners.delete(key);
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
