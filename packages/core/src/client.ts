import { encodeFrame, decodeFrame } from "./frame.js";
import type { PPSchemaRegistry } from "./schema.js";
import type { PPClientOptions, PPClientEventMap, PPMessage, PPMode, PPReconnectConfig } from "./types.js";
import { PPError } from "./errors.js";
import { createLogger, type PPLogger } from "./logger.js";

type EventHandler = (...args: unknown[]) => void;

/** #2: Ack callback type */
export type PPClientAckCallback = (err: Error | null, ...args: any[]) => void;

/** #5: Send options */
export interface PPClientSendOptions {
  volatile?: boolean;
  namespace?: string;
}

async function resolveWS(): Promise<typeof globalThis.WebSocket> {
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  const ws = await import("ws");
  return ws.default as unknown as typeof globalThis.WebSocket;
}

const MAX_QUEUE_SIZE = 256;
let clientAckCounter = 0;

export class PPClient {
  private ws: WebSocket | null = null;
  private mode: PPMode;
  private registry?: PPSchemaRegistry;
  private options: PPClientOptions;
  private listeners = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closed = false;
  private messageQueue: PPMessage[] = [];

  // #4: Catch-all listeners
  private anyListeners: Set<(event: string, ...args: unknown[]) => void> = new Set();

  // #2: Ack callbacks
  private ackCallbacks = new Map<number, { callback: PPClientAckCallback; timer: ReturnType<typeof setTimeout> }>();

  // #8: Recovery session
  private sessionId: string | null = null;
  private lastOffset = -1;
  private recoveryToken: string | null = null;

  /** Arbitrary metadata — mirrors server-side client.data. */
  data: Record<string, unknown> = {};

  // Logger
  readonly log: PPLogger;

  // Resolved reconnect config
  private reconnectConfig: PPReconnectConfig | null = null;

  constructor(options: PPClientOptions) {
    this.options = options;
    this.mode = options.mode ?? "chat";
    this.registry = options.registry;
    this.log = createLogger(options.logger);

    // Resolve reconnect config (backward-compatible)
    if (options.reconnect === true) {
      this.reconnectConfig = {
        enabled: true,
        strategy: "exponential",
        baseDelay: options.reconnectInterval ?? 1000,
        maxDelay: 30_000,
        maxAttempts: options.maxReconnectAttempts ?? 10,
        jitter: true,
      };
    } else if (typeof options.reconnect === "object") {
      this.reconnectConfig = {
        enabled: options.reconnect.enabled ?? true,
        strategy: options.reconnect.strategy ?? "exponential",
        baseDelay: options.reconnect.baseDelay ?? 1000,
        maxDelay: options.reconnect.maxDelay ?? 30_000,
        maxAttempts: options.reconnect.maxAttempts ?? 10,
        jitter: options.reconnect.jitter ?? true,
        onReconnect: options.reconnect.onReconnect,
        onGiveUp: options.reconnect.onGiveUp,
      };
    }

    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const WS = await resolveWS();

      // Token refresh on reconnect
      if (this.options.getToken) {
        try {
          const token = await this.options.getToken();
          if (token) {
            (this as any)._authToken = token;
          }
        } catch {
          // Token refresh failed — connect anyway, server middleware will reject
        }
      }

      // #8: Append recovery params if we have a session
      let url = this.options.url;
      if (this.sessionId && this.lastOffset >= 0) {
        const separator = url.includes("?") ? "&" : "?";
        url = `${url}${separator}pp_sid=${this.sessionId}&pp_offset=${this.lastOffset}`;
        // Security: Append recovery HMAC token if available
        if (this.recoveryToken) {
          url = `${url}&pp_rtoken=${this.recoveryToken}`;
        }
      }

      // Security: Token is NO LONGER appended as URL query parameter.
      // Instead it is sent as the first binary frame after connection opens.

      this.ws = new WS(url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;

        // Send auth token as first frame (not in URL to avoid log/proxy leakage)
        const token = (this as any)._authToken;
        if (token) {
          this.send({ type: "__pp_auth", payload: { token } });
        }

        this._emit("open");
        this.flushQueue();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = event.data as ArrayBuffer;
          const { message } = decodeFrame(data, this.registry);

          // #8: Handle session info
          if (message.type === "__pp_session") {
            const { sid, offset, rtoken } = message.payload as { sid: string; offset: number; rtoken?: string };
            this.sessionId = sid;
            this.lastOffset = offset;
            if (rtoken) this.recoveryToken = rtoken;
            return;
          }

          // #8: Handle recovery info
          if (message.type === "__pp_recovery") {
            this._emit("recovery", message.payload);
            return;
          }

          // #2: Handle ack responses
          if (message.type === "__pp_ack") {
            const { ackId, args } = message.payload as { ackId: number; args: any[] };
            const entry = this.ackCallbacks.get(ackId);
            if (entry) {
              clearTimeout(entry.timer);
              this.ackCallbacks.delete(ackId);
              entry.callback(null, ...args);
            }
            return;
          }

          // Handle error messages from server
          if (message.type === "__pp_error") {
            const { code, message: errMsg } = message.payload as { code: string; message: string };
            this.log.warn(`Server error: [${code}] ${errMsg}`);
            this._emit("serverError", { code, message: errMsg });
            this._emit("error", new PPError(code as any, errMsg));
            return;
          }

          // Handle graceful shutdown notice
          if (message.type === "__pp_shutdown") {
            this.log.info("Server shutting down");
            this._emit("close", 1001, "Server shutting down");
            return;
          }

          // Handle typed room state
          if (message.type === "__pp_room_state") {
            this._emit("roomState", message.payload);
            return;
          }

          // Handle typed room delta
          if (message.type === "__pp_room_delta") {
            this._emit("roomDelta", message.payload);
            return;
          }

          // Handle presence
          if (message.type === "__pp_presence") {
            this._emit("presence", message.payload);
            return;
          }

          // #8: Track offset from received messages
          if (this.sessionId) {
            this.lastOffset++;
          }

          this._emit("message", message);
        } catch {
          try {
            const message = JSON.parse(String(event.data)) as PPMessage;
            this._emit("message", message);
          } catch {
            this._emit("error", new PPError("DECODE_ERROR", "Failed to decode incoming frame"));
          }
        }
      };

      this.ws.onclose = (event) => {
        this._emit("close", (event as { code: number }).code, (event as { reason: string }).reason);
        this.maybeReconnect();
      };

      this.ws.onerror = () => {
        this._emit("error", new PPError("CONNECTION_ERROR", "WebSocket error"));
      };
    } catch (err) {
      this._emit("error", err instanceof Error ? err : new PPError("CONNECTION_ERROR", String(err)));
      this.maybeReconnect();
    }
  }

  private maybeReconnect(): void {
    if (this.closed) return;
    if (!this.reconnectConfig?.enabled) return;

    const rc = this.reconnectConfig;
    const max = rc.maxAttempts ?? 10;
    if (max > 0 && this.reconnectAttempts >= max) {
      this.log.warn(`Reconnect failed after ${max} attempts`);
      rc.onGiveUp?.();
      this._emit("reconnectFailed");
      return;
    }

    const delay = this.computeDelay(this.reconnectAttempts, rc);
    this.reconnectAttempts++;

    this.log.info(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    rc.onReconnect?.(this.reconnectAttempts);
    this._emit("reconnecting", { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private computeDelay(attempt: number, rc: PPReconnectConfig): number {
    const base = rc.baseDelay ?? 1000;
    const maxDelay = rc.maxDelay ?? 30_000;
    let delay: number;

    if (typeof rc.strategy === "function") {
      delay = rc.strategy(attempt);
    } else {
      switch (rc.strategy) {
        case "linear":
          delay = base * (attempt + 1);
          break;
        case "fibonacci": {
          let a = base, b = base;
          for (let i = 0; i < attempt; i++) { const t = b; b = a + b; a = t; }
          delay = b;
          break;
        }
        case "exponential":
        default:
          delay = base * Math.pow(1.5, attempt);
          break;
      }
    }

    delay = Math.min(delay, maxDelay);

    // Jitter: ±20%
    if (rc.jitter !== false) {
      delay += delay * 0.4 * (Math.random() - 0.5);
    }

    return delay;
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      try {
        this.sendImmediate(msg);
      } catch {
        this.messageQueue.unshift(msg);
        break;
      }
    }
  }

  private sendImmediate(message: PPMessage): void {
    if (!this.ws || this.ws.readyState !== 1) {
      throw new Error("PPClient is not connected");
    }
    const frame = encodeFrame(this.mode, message, this.registry);
    this.ws.send(frame);
  }

  /**
   * Send a message. Supports options and ack callbacks.
   *
   * #2 Ack: `client.send(msg, (err, response) => { ... })`
   * #5 Volatile: `client.send(msg, { volatile: true })`
   */
  send<T = unknown>(message: PPMessage<T>, optionsOrCallback?: PPClientSendOptions | PPClientAckCallback): boolean {
    const isCallback = typeof optionsOrCallback === "function";
    const options: PPClientSendOptions = isCallback ? {} : (optionsOrCallback ?? {});
    const callback: PPClientAckCallback | undefined = isCallback ? optionsOrCallback : undefined;

    const wireMsg: any = { ...message };

    // #1: Namespace tagging
    if (options.namespace && options.namespace !== "/") {
      wireMsg.__ns = options.namespace;
    }

    // #2: Ack ID
    if (callback) {
      const ackId = ++clientAckCounter;
      wireMsg.__ackId = ackId;

      const timer = setTimeout(() => {
        this.ackCallbacks.delete(ackId);
        callback(new PPError("TIMEOUT_ERROR", `Ack timeout for ${message.type}`, { ackId }));
      }, this.options.ackTimeout ?? 10_000);

      this.ackCallbacks.set(ackId, { callback, timer });
    }

    // Try to send
    if (this.ws && this.ws.readyState === 1) {
      try {
        const frame = encodeFrame(this.mode, wireMsg as PPMessage, this.registry);
        this.ws.send(frame);
        return true;
      } catch {
        if (options.volatile) return false; // #5: Drop silently
      }
    }

    // #5: Volatile messages are dropped when not connected
    if (options.volatile) return false;

    // Queue if reconnect is enabled
    if (this.options.reconnect && !this.closed) {
      if (this.messageQueue.length >= MAX_QUEUE_SIZE) {
        this.messageQueue.shift();
      }
      this.messageQueue.push(wireMsg as PPMessage);
      return false;
    }

    throw new PPError("CONNECTION_ERROR", "PPClient is not connected");
  }

  /** #2: Send an ack response back to the server. */
  sendAck(ackId: number, ...args: any[]): void {
    this.send({
      type: "__pp_ack",
      payload: { ackId, args },
    });
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === 1;
  }

  get queueSize(): number {
    return this.messageQueue.length;
  }

  /** #8: Current recovery session ID */
  get recoverySessionId(): string | null {
    return this.sessionId;
  }

  close(): void {
    this.closed = true;
    this.messageQueue.length = 0;
    // Cleanup ack timers
    for (const [, entry] of this.ackCallbacks) {
      clearTimeout(entry.timer);
    }
    this.ackCallbacks.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }

  /** DX shorthand: client.emit("chat", { text: "hi" }) */
  emit<T = unknown>(type: string, payload: T): boolean {
    return this.send({ type, payload });
  }

  on<K extends keyof PPClientEventMap>(event: K, listener: PPClientEventMap[K]): void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener as EventHandler);
  }

  /** Listen once, then auto-remove. */
  once<K extends keyof PPClientEventMap>(event: K, listener: PPClientEventMap[K]): void {
    const wrapped = ((...args: unknown[]) => {
      this.off(event, wrapped as any);
      (listener as EventHandler)(...args);
    }) as PPClientEventMap[K];
    this.on(event, wrapped);
  }

  off<K extends keyof PPClientEventMap>(event: K, listener: PPClientEventMap[K]): void {
    this.listeners.get(event as string)?.delete(listener as EventHandler);
  }

  /** #4: Catch-all listener */
  onAny(listener: (event: string, ...args: unknown[]) => void): void {
    this.anyListeners.add(listener);
  }

  offAny(listener: (event: string, ...args: unknown[]) => void): void {
    this.anyListeners.delete(listener);
  }

  /** Internal emit for event handlers. Public emit() is the send shorthand. */
  private _emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
    // #4: Catch-all
    for (const handler of this.anyListeners) {
      handler(event, ...args);
    }
  }
}
