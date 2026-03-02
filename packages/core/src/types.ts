import type { PPSchemaRegistry } from "./schema.js";

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

export interface PPServerOptions {
  port: number;
  host?: string;
  mode?: PPMode;
  registry?: PPSchemaRegistry;
}

export interface PPClientOptions {
  url: string;
  mode?: PPMode;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  registry?: PPSchemaRegistry;
}

// --- Typed event system ---

export interface PPClientSocket {
  id: string;
  send<T = unknown>(message: PPMessage<T>): void;
  close(): void;
  on<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
  off<K extends keyof PPClientSocketEventMap>(event: K, listener: PPClientSocketEventMap[K]): void;
}

export interface PPClientSocketEventMap {
  message: (data: PPMessage) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

export interface PPServerEventMap {
  connection: (client: PPClientSocket) => void;
  error: (error: Error) => void;
  close: () => void;
}

export interface PPClientEventMap {
  open: () => void;
  message: (data: PPMessage) => void;
  close: (code: number, reason: string) => void;
  error: (error: Error) => void;
}

/**
 * Typed message handler that infers the payload type from a schema registry.
 * Usage:
 *   type MyEvents = { 'player:move': { x: number; y: number } };
 *   server.onMessage<MyEvents, 'player:move'>('player:move', (client, data) => { ... });
 */
export type PPTypedMessageHandler<
  TEvents extends Record<string, unknown>,
  K extends keyof TEvents,
> = (client: PPClientSocket, message: PPMessage<TEvents[K]>) => void;
