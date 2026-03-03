/**
 * PPClient — PaindaProtocol Browser Client
 *
 * JSON ↔ Binary Bridge: Developers write JSON, wire uses PP binary frames.
 *
 * Features:
 * - Auto-reconnect with exponential/linear/fibonacci backoff + jitter
 * - Message queue (buffers offline, flushes on reconnect)
 * - Typed events (on/off/once/onAny)
 * - Connection state tracking
 * - DX shortcuts: emit("type", payload) / on("type", handler)
 * - Ack callbacks
 */

import { encodeFrame, decodeFrame, decodeFrameAsync, isPPFrame } from "./frame.js";
import type {
    PPMode,
    PPMessage,
    PPReconnectConfig,
    PPReconnectStrategy,
    PPClientOptions,
    PPConnectionState,
} from "./types.js";

type EventHandler = (...args: any[]) => void;
type AckCallback = (error: Error | null, ...args: any[]) => void;

const MAX_QUEUE = 256;
let ackCounter = 0;

export class PPClient {
    private ws: WebSocket | null = null;
    private mode: PPMode;
    private options: PPClientOptions;
    private protocol: "binary" | "json";
    private listeners = new Map<string, Set<EventHandler>>();
    private anyListeners = new Set<(event: string, ...args: unknown[]) => void>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private closed = false;
    private messageQueue: PPMessage[] = [];
    private ackCallbacks = new Map<number, { callback: AckCallback; timer: ReturnType<typeof setTimeout> }>();
    private debug: boolean;
    private reconnectConfig: PPReconnectConfig | null = null;

    /** Current connection state */
    state: PPConnectionState = "disconnected";

    /** Arbitrary metadata */
    data: Record<string, unknown> = {};

    constructor(options: PPClientOptions) {
        this.options = options;
        this.mode = options.mode ?? "chat";
        this.protocol = options.protocol ?? "binary";
        this.debug = options.debug ?? false;

        // Resolve reconnect config
        if (options.reconnect === true) {
            this.reconnectConfig = {
                enabled: true,
                strategy: "exponential",
                baseDelay: 1000,
                maxDelay: 30_000,
                maxAttempts: 10,
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

    // ---- Connection ----

    private async connect(): Promise<void> {
        this.state = this.reconnectAttempts > 0 ? "reconnecting" : "connecting";
        this._fire("stateChange", this.state);

        try {
            let url = this.options.url;

            // Token refresh
            if (this.options.getToken) {
                const token = await this.options.getToken();
                if (token) {
                    const sep = url.includes("?") ? "&" : "?";
                    url = `${url}${sep}token=${encodeURIComponent(token)}`;
                }
            }

            const ws = new WebSocket(url);
            ws.binaryType = "arraybuffer";
            this.ws = ws;

            ws.onopen = () => {
                this.state = "connected";
                this.reconnectAttempts = 0;
                this.log("Connected to", this.options.url);
                this._fire("open");
                this._fire("stateChange", "connected");
                this.flushQueue();
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    if (this.protocol === "json" || typeof event.data === "string") {
                        // JSON mode or text message
                        const msg = typeof event.data === "string"
                            ? JSON.parse(event.data)
                            : JSON.parse(new TextDecoder().decode(event.data));

                        this.handleMessage(msg);
                    } else if (event.data instanceof ArrayBuffer) {
                        // Binary mode — decode PP frame
                        const data = new Uint8Array(event.data);

                        if (isPPFrame(data)) {
                            // PP binary frame → decode to JSON message
                            const { message } = decodeFrame(data);
                            this.handleMessage(message);
                        } else {
                            // Unknown binary — try as JSON
                            const text = new TextDecoder().decode(data);
                            const msg = JSON.parse(text);
                            this.handleMessage(msg);
                        }
                    }
                } catch (err) {
                    this.log("Failed to decode message:", err);
                    this._fire("error", err instanceof Error ? err : new Error(String(err)));
                }
            };

            ws.onclose = (event) => {
                this.log("Disconnected:", event.code, event.reason);
                this.state = "disconnected";
                this._fire("close", event.code, event.reason || "");
                this._fire("stateChange", "disconnected");
                this.maybeReconnect();
            };

            ws.onerror = () => {
                this._fire("error", new Error("WebSocket error"));
            };
        } catch (err) {
            this.log("Connection failed:", err);
            this._fire("error", err instanceof Error ? err : new Error(String(err)));
            this.maybeReconnect();
        }
    }

    private handleMessage(msg: PPMessage | any): void {
        // Internal PP messages
        if (msg.type === "__pp_error") {
            this._fire("serverError", msg.payload ?? msg);
            return;
        }
        if (msg.type === "__pp_ack") {
            const ack = this.ackCallbacks.get(msg.payload?.ackId);
            if (ack) {
                clearTimeout(ack.timer);
                this.ackCallbacks.delete(msg.payload.ackId);
                ack.callback(null, ...(msg.payload.args ?? []));
            }
            return;
        }

        // Fire typed event handler
        this._fire("message", msg);

        // Fire by message type (the main DX)
        if (msg.type) {
            this._fire(msg.type, msg.payload ?? msg);
        }
    }

    // ---- Reconnect ----

    private maybeReconnect(): void {
        if (this.closed || !this.reconnectConfig?.enabled) return;

        const rc = this.reconnectConfig;
        if (rc.maxAttempts && this.reconnectAttempts >= rc.maxAttempts) {
            this.log("Max reconnect attempts reached");
            this._fire("reconnectFailed");
            rc.onGiveUp?.();
            return;
        }

        this.reconnectAttempts++;
        const delay = this.computeDelay(this.reconnectAttempts, rc);

        this.state = "reconnecting";
        this._fire("stateChange", "reconnecting");
        this._fire("reconnecting", { attempt: this.reconnectAttempts, delay });
        rc.onReconnect?.(this.reconnectAttempts);

        this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    private computeDelay(attempt: number, rc: PPReconnectConfig): number {
        const base = rc.baseDelay ?? 1000;
        const max = rc.maxDelay ?? 30_000;
        let delay: number;

        if (typeof rc.strategy === "function") {
            delay = rc.strategy(attempt);
        } else {
            switch (rc.strategy) {
                case "linear":
                    delay = base * attempt;
                    break;
                case "fibonacci": {
                    let a = base, b = base;
                    for (let i = 2; i < attempt; i++) {
                        [a, b] = [b, a + b];
                    }
                    delay = b;
                    break;
                }
                case "exponential":
                default:
                    delay = base * Math.pow(2, attempt - 1);
                    break;
            }
        }

        delay = Math.min(delay, max);

        // Jitter: ±25%
        if (rc.jitter !== false) {
            delay = delay * (0.75 + Math.random() * 0.5);
        }

        return Math.round(delay);
    }

    // ---- Send ----

    private flushQueue(): void {
        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()!;
            this.sendImmediate(msg);
        }
    }

    private sendImmediate(message: PPMessage): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        if (this.protocol === "binary") {
            // JSON → Binary bridge: encode as PP frame
            const frame = encodeFrame(this.mode, message);
            this.ws.send(frame);
        } else {
            // Pure JSON mode
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Send a PP message. Returns true if sent, false if queued.
     */
    send<T = unknown>(message: PPMessage<T>, callback?: AckCallback): boolean {
        if (callback) {
            const ackId = ++ackCounter;
            (message as any).__ackId = ackId;
            const timer = setTimeout(() => {
                this.ackCallbacks.delete(ackId);
                callback(new Error("Ack timeout"));
            }, this.options.ackTimeout ?? 10000);
            this.ackCallbacks.set(ackId, { callback, timer });
        }

        if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendImmediate(message);
            return true;
        }

        // Queue for when we reconnect
        if (this.messageQueue.length < MAX_QUEUE) {
            this.messageQueue.push(message);
        }
        return false;
    }

    /**
     * DX shorthand: client.emit("chat", { text: "hi" })
     */
    emit<T = unknown>(type: string, payload?: T): boolean {
        return this.send({ type, payload: payload as T });
    }

    // ---- Events ----

    on(event: string, handler: EventHandler): void {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(handler);
    }

    once(event: string, handler: EventHandler): void {
        const wrapper = (...args: any[]) => {
            this.off(event, wrapper);
            handler(...args);
        };
        this.on(event, wrapper);
    }

    off(event: string, handler: EventHandler): void {
        this.listeners.get(event)?.delete(handler);
    }

    onAny(handler: (event: string, ...args: unknown[]) => void): void {
        this.anyListeners.add(handler);
    }

    offAny(handler: (event: string, ...args: unknown[]) => void): void {
        this.anyListeners.delete(handler);
    }

    private _fire(event: string, ...args: unknown[]): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const h of handlers) {
                try { h(...args); } catch (err) { console.error(`[@painda/client] ${event} handler error:`, err); }
            }
        }
        for (const h of this.anyListeners) {
            try { h(event, ...args); } catch (err) { console.error(`[@painda/client] onAny handler error:`, err); }
        }
    }

    // ---- State ----

    get connected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    get queueSize(): number {
        return this.messageQueue.length;
    }

    /** Close the connection permanently (no reconnect). */
    close(): void {
        this.closed = true;
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        for (const [, ack] of this.ackCallbacks) clearTimeout(ack.timer);
        this.ackCallbacks.clear();
        this.ws?.close();
        this.ws = null;
        this.state = "disconnected";
        this._fire("stateChange", "disconnected");
    }

    /** Disconnect and reconnect manually. */
    reconnect(): void {
        this.closed = false;
        this.reconnectAttempts = 0;
        this.ws?.close();
    }

    private log(...args: unknown[]): void {
        if (this.debug) console.log("[@painda/client]", ...args);
    }
}
