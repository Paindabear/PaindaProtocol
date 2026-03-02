import { encodeFrame, decodeFrame } from "./frame.js";
import type { PPSchemaRegistry } from "./schema.js";
import type { PPClientOptions, PPClientEventMap, PPMessage, PPMode } from "./types.js";

type EventHandler = (...args: unknown[]) => void;

async function resolveWS(): Promise<typeof globalThis.WebSocket> {
  if (typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  const ws = await import("ws");
  return ws.default as unknown as typeof globalThis.WebSocket;
}

export class PPClient {
  private ws: WebSocket | null = null;
  private mode: PPMode;
  private registry?: PPSchemaRegistry;
  private options: PPClientOptions;
  private listeners = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private closed = false;

  constructor(options: PPClientOptions) {
    this.options = options;
    this.mode = options.mode ?? "chat";
    this.registry = options.registry;
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const WS = await resolveWS();
      this.ws = new WS(this.options.url);
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit("open");
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = event.data as ArrayBuffer;
          const { message } = decodeFrame(data, this.registry);
          this.emit("message", message);
        } catch {
          try {
            const message = JSON.parse(String(event.data)) as PPMessage;
            this.emit("message", message);
          } catch {
            this.emit("error", new Error("Failed to decode incoming frame"));
          }
        }
      };

      this.ws.onclose = (event) => {
        this.emit("close", (event as { code: number }).code, (event as { reason: string }).reason);
        this.maybeReconnect();
      };

      this.ws.onerror = () => {
        this.emit("error", new Error("WebSocket error"));
      };
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      this.maybeReconnect();
    }
  }

  private maybeReconnect(): void {
    if (this.closed) return;
    if (!this.options.reconnect) return;

    const max = this.options.maxReconnectAttempts ?? 10;
    if (this.reconnectAttempts >= max) return;

    const interval = this.options.reconnectInterval ?? 1000;
    const delay = interval * Math.pow(1.5, this.reconnectAttempts);

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send<T = unknown>(message: PPMessage<T>): void {
    if (!this.ws || this.ws.readyState !== 1) { // 1 = WebSocket.OPEN
      throw new Error("PPClient is not connected");
    }
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry);
    this.ws.send(frame);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }

  on<K extends keyof PPClientEventMap>(event: K, listener: PPClientEventMap[K]): void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener as EventHandler);
  }

  off<K extends keyof PPClientEventMap>(event: K, listener: PPClientEventMap[K]): void {
    this.listeners.get(event as string)?.delete(listener as EventHandler);
  }

  private emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }
}
