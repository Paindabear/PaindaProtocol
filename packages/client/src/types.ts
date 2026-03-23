/**
 * PaindaProtocol types — browser-compatible subset of @painda/core types.
 * These mirror the server-side types exactly for wire compatibility.
 */

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

export type PPReconnectStrategy = "exponential" | "linear" | "fibonacci";

export interface PPReconnectConfig {
    enabled?: boolean;
    strategy?: PPReconnectStrategy | ((attempt: number) => number);
    baseDelay?: number;
    maxDelay?: number;
    maxAttempts?: number;
    jitter?: boolean;
    onReconnect?: (attempt: number) => void;
    onGiveUp?: () => void;
}

export type PPConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface PPClientOptions {
    /** WebSocket URL (ws:// or wss://) */
    url: string;

    /** PP wire mode. Default: "chat" */
    mode?: PPMode;

    /** Reconnect configuration. true = defaults, object = custom config. */
    reconnect?: boolean | PPReconnectConfig;

    /** Ack callback timeout (ms). Default: 10000 */
    ackTimeout?: number;

    /** Token refresh callback — called before each (re)connect */
    getToken?: () => Promise<string | null>;

    /**
     * Protocol mode:
     * - "binary" (default): JSON ↔ Binary bridge. Client sends/receives JSON,
     *   wire uses PP binary frames (PPND magic + v2 header).
     * - "json": Pure JSON mode. No binary encoding, compatible with non-PP servers.
     */
    protocol?: "binary" | "json";

    /** Enable debug logging to console. Default: false */
    debug?: boolean;

    /** Schema registry for binary type IDs (optional) */
    registry?: any;
}
