/**
 * #7: Transport abstraction for WebSocket and HTTP Long-Polling fallback.
 * Allows PaindaProtocol to start with HTTP Long-Polling and upgrade to WebSocket.
 */

import type { PPMessage } from "./types.js";
import type { IncomingMessage, ServerResponse } from "node:http";

export type PPTransportType = "websocket" | "polling";

export interface PPTransportEvents {
    message: (data: Uint8Array | string) => void;
    close: (code: number, reason: string) => void;
    error: (err: Error) => void;
}

/**
 * Abstract transport interface — each transport (WS, HTTP polling) implements this.
 */
export interface PPTransport {
    readonly type: PPTransportType;
    readonly isOpen: boolean;

    send(data: Uint8Array | string): void;
    close(code?: number, reason?: string): void;

    on<K extends keyof PPTransportEvents>(event: K, listener: PPTransportEvents[K]): void;
    off<K extends keyof PPTransportEvents>(event: K, listener: PPTransportEvents[K]): void;
}

/**
 * HTTP Long-Polling transport.
 * Buffers messages and delivers them on the next poll request.
 * Automatically upgrades to WebSocket if the client supports it.
 */
export class PollingTransport implements PPTransport {
    readonly type: PPTransportType = "polling";
    private _isOpen = true;
    private buffer: (Uint8Array | string)[] = [];
    private pendingPollResolve: ((data: (Uint8Array | string)[]) => void) | null = null;
    private listeners = new Map<string, Set<(...args: any[]) => void>>();
    private pollTimeout: ReturnType<typeof setTimeout> | null = null;

    /** Timeout for long-poll requests (ms). Default: 25s */
    private readonly pollTimeoutMs: number;

    constructor(options?: { pollTimeoutMs?: number }) {
        this.pollTimeoutMs = options?.pollTimeoutMs ?? 25_000;
    }

    get isOpen(): boolean {
        return this._isOpen;
    }

    /**
     * Called when the client makes a GET request to poll for messages.
     * Returns buffered messages, or waits for new ones.
     */
    async handlePoll(): Promise<(Uint8Array | string)[]> {
        if (this.buffer.length > 0) {
            const data = this.buffer.splice(0);
            return data;
        }

        // Wait for messages or timeout
        return new Promise<(Uint8Array | string)[]>((resolve) => {
            this.pendingPollResolve = resolve;

            this.pollTimeout = setTimeout(() => {
                this.pendingPollResolve = null;
                resolve([]);
            }, this.pollTimeoutMs);
        });
    }

    /**
     * Called when the client sends data via POST.
     */
    handlePost(data: Uint8Array | string): void {
        this.emit("message", data);
    }

    send(data: Uint8Array | string): void {
        if (!this._isOpen) return;

        if (this.pendingPollResolve) {
            // Deliver immediately to the waiting poll
            if (this.pollTimeout) clearTimeout(this.pollTimeout);
            this.pendingPollResolve([data]);
            this.pendingPollResolve = null;
        } else {
            // Buffer for next poll
            this.buffer.push(data);
        }
    }

    close(code?: number, reason?: string): void {
        this._isOpen = false;
        if (this.pollTimeout) clearTimeout(this.pollTimeout);
        if (this.pendingPollResolve) {
            this.pendingPollResolve([]);
            this.pendingPollResolve = null;
        }
        this.emit("close", code ?? 1000, reason ?? "");
    }

    on<K extends keyof PPTransportEvents>(event: K, listener: PPTransportEvents[K]): void {
        const key = event as string;
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key)!.add(listener);
    }

    off<K extends keyof PPTransportEvents>(event: K, listener: PPTransportEvents[K]): void {
        this.listeners.get(event as string)?.delete(listener);
    }

    private emit(event: string, ...args: any[]): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(...args);
            }
        }
    }
}

/**
 * Handles HTTP upgrade negotiation.
 * - GET /pp/poll?sid=xxx → Long-polling messages
 * - POST /pp/poll?sid=xxx → Send message via polling
 * - GET with Upgrade: websocket → Upgrade to WS
 */
export class PPTransportManager {
    private pollingSessions = new Map<string, PollingTransport>();
    private sessionTimeout: number;

    constructor(options?: { sessionTimeoutMs?: number }) {
        this.sessionTimeout = options?.sessionTimeoutMs ?? 60_000;
    }

    /** Create a new polling session, returns session ID */
    createSession(): { sid: string; transport: PollingTransport } {
        const sid = crypto.randomUUID();
        const transport = new PollingTransport();

        transport.on("close", () => {
            this.pollingSessions.delete(sid);
        });

        this.pollingSessions.set(sid, transport);

        // Auto-cleanup stale sessions
        setTimeout(() => {
            if (this.pollingSessions.has(sid)) {
                transport.close(4000, "Session timeout");
            }
        }, this.sessionTimeout);

        return { sid, transport };
    }

    /** Get an existing polling session by ID */
    getSession(sid: string): PollingTransport | undefined {
        return this.pollingSessions.get(sid);
    }

    /** Remove a session */
    removeSession(sid: string): void {
        const transport = this.pollingSessions.get(sid);
        if (transport) {
            transport.close();
            this.pollingSessions.delete(sid);
        }
    }

    /** Handle an incoming HTTP request for polling */
    async handleRequest(
        req: IncomingMessage,
        res: ServerResponse,
    ): Promise<PollingTransport | null> {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const sid = url.searchParams.get("sid");

        // New session
        if (!sid && req.method === "GET") {
            const { sid: newSid, transport } = this.createSession();
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            });
            res.end(JSON.stringify({ sid: newSid }));
            return transport;
        }

        if (!sid) {
            res.writeHead(400);
            res.end("Missing sid");
            return null;
        }

        const transport = this.pollingSessions.get(sid);
        if (!transport) {
            res.writeHead(404);
            res.end("Session not found");
            return null;
        }

        // Poll for messages
        if (req.method === "GET") {
            const messages = await transport.handlePoll();
            res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Access-Control-Allow-Origin": "*",
            });
            // Encode as JSON array of base64 strings for simplicity
            const encoded = messages.map((m) =>
                typeof m === "string" ? m : Buffer.from(m).toString("base64"),
            );
            res.end(JSON.stringify(encoded));
            return null;
        }

        // Send data
        if (req.method === "POST") {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(chunk as Buffer);
            }
            const body = Buffer.concat(chunks);
            transport.handlePost(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
            res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
            res.end("ok");
            return null;
        }

        res.writeHead(405);
        res.end("Method not allowed");
        return null;
    }

    close(): void {
        for (const [, transport] of this.pollingSessions) {
            transport.close();
        }
        this.pollingSessions.clear();
    }
}
