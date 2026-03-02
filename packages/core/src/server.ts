import { WebSocketServer, WebSocket, type RawData } from "ws";
import { encodeFrame, decodeFrame } from "./frame.js";
import type { PPSchemaRegistry } from "./schema.js";
import type {
  PPServerOptions,
  PPMessage,
  PPMode,
  PPClientSocket,
  PPServerEventMap,
  PPClientSocketEventMap,
} from "./types.js";

type EventHandler = (...args: unknown[]) => void;

let clientCounter = 0;

function generateId(): string {
  return `pp_${Date.now().toString(36)}_${(++clientCounter).toString(36)}`;
}

class PPClientSocketImpl implements PPClientSocket {
  readonly id: string;
  private ws: WebSocket;
  private mode: PPMode;
  private registry?: PPSchemaRegistry;
  private listeners = new Map<string, Set<EventHandler>>();

  constructor(ws: WebSocket, mode: PPMode, registry?: PPSchemaRegistry) {
    this.id = generateId();
    this.ws = ws;
    this.mode = mode;
    this.registry = registry;

    this.ws.on("message", (data: RawData, isBinary: boolean) => {
      try {
        if (isBinary || data instanceof Buffer || data instanceof Uint8Array || data instanceof ArrayBuffer) {
          // Pass the buffer view directly to decodeFrame for zero-copy parsing
          const buf = data instanceof Buffer ? new Uint8Array(data.buffer, data.byteOffset, data.length) : data;
          const { message } = decodeFrame(buf as Uint8Array | ArrayBuffer, this.registry);
          this.emit("message", message);
        } else {
          // Native text mode
          const text = data.toString();
          const message = JSON.parse(text) as PPMessage;
          this.emit("message", message);
        }
      } catch (err) {
        this.emit("error", new Error(`Failed to decode incoming message: ${(err as Error).message}`));
      }
    });

    this.ws.on("close", (code: number, reason: Buffer) => {
      this.emit("close", code, reason.toString());
    });

    this.ws.on("error", (err: Error) => {
      this.emit("error", err);
    });
  }

  send<T = unknown>(message: PPMessage<T>): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    const frame = encodeFrame(this.mode, message as PPMessage, this.registry);
    this.ws.send(frame);
  }

  close(): void {
    this.ws.close();
  }

  on<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener as EventHandler);
  }

  off<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void {
    const key = event as string;
    const set = this.listeners.get(key);
    if (set) {
      set.delete(listener as EventHandler);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    }
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

export class PPServer {
  private wss: WebSocketServer;
  private mode: PPMode;
  private registry?: PPSchemaRegistry;
  private clients = new Set<PPClientSocketImpl>();
  private listeners = new Map<string, Set<EventHandler>>();

  constructor(options: PPServerOptions) {
    this.mode = options.mode ?? "chat";
    this.registry = options.registry;
    this.wss = new WebSocketServer({
      port: options.port,
      host: options.host,
    });

    this.wss.on("connection", (ws: WebSocket) => {
      const client = new PPClientSocketImpl(ws, this.mode, this.registry);
      this.clients.add(client);

      client.on("close", () => {
        this.clients.delete(client);
      });

      this.emit("connection", client);
    });

    this.wss.on("error", (err: Error) => {
      this.emit("error", err);
    });

    this.wss.on("close", () => {
      this.emit("close");
    });
  }

  broadcast<T = unknown>(message: PPMessage<T>, exclude?: PPClientSocket): void {
    for (const client of this.clients) {
      if (exclude && client.id === exclude.id) continue;
      client.send(message);
    }
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.wss.close();
  }

  get clientCount(): number {
    return this.clients.size;
  }

  on<K extends keyof PPServerEventMap>(event: K, listener: PPServerEventMap[K]): void {
    const key = event as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener as EventHandler);
  }

  off<K extends keyof PPServerEventMap>(event: K, listener: PPServerEventMap[K]): void {
    const key = event as string;
    const set = this.listeners.get(key);
    if (set) {
      set.delete(listener as EventHandler);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    }
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
