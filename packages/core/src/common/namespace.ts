/**
 * #1: Namespaces — Multiplexing over a single WebSocket connection.
 * #2: Acknowledgements — Request-Response pattern with callbacks.
 * #4: Catch-All Listener — onAny() for debugging/logging.
 * #5: Volatile Messages — drop instead of queue.
 */

import type { PPMessage, PPClientSocket, PPClientSocketEventMap } from "./types.js";
import { PPMiddlewarePipeline, type PPConnectionMiddleware, type PPMessageMiddleware } from "./middleware.js";
import { PPError } from "./errors.js";

type EventHandler = (...args: unknown[]) => void;

// ---- Ack System (#2) ----

let globalAckCounter = 0;

/** A message that includes an ack callback. */
export interface PPAckMessage<T = unknown> extends PPMessage<T> {
    __ackId?: number;
}

/** Callback type for acknowledgements. */
export type PPAckCallback = (...args: any[]) => void;

// ---- Send Options (#5) ----

export interface PPSendOptions {
    /** If true, the message is dropped silently if the client is busy/disconnected. */
    volatile?: boolean;
    /** Namespace to send to. Default: "/" */
    namespace?: string;
}

// ---- Namespace (#1) ----

/**
 * A Namespace is a communication channel that allows you to split the logic
 * of your application over a single shared connection.
 * Similar to Socket.io's `io.of("/namespace")`.
 */
export class PPNamespace {
    readonly name: string;
    private sockets = new Map<string, PPNamespacedSocket>();
    private pipeline = new PPMiddlewarePipeline();
    private listeners = new Map<string, Set<EventHandler>>();
    private anyListeners: Set<(event: string, ...args: unknown[]) => void> = new Set();

    constructor(name: string) {
        this.name = name;
    }

    /** #3: Add connection middleware for this namespace. */
    use(fn: PPConnectionMiddleware): this {
        this.pipeline.useConnection(fn);
        return this;
    }

    /** #3: Add message middleware for this namespace. */
    useMessage(fn: PPMessageMiddleware): this {
        this.pipeline.useMessage(fn);
        return this;
    }

    /** Run connection middleware for a socket. */
    async runConnectionMiddleware(socket: PPClientSocket): Promise<void> {
        return this.pipeline.runConnection(socket);
    }

    /** Run message middleware for a socket. */
    async runMessageMiddleware(socket: PPClientSocket, message: PPMessage): Promise<void> {
        return this.pipeline.runMessage(socket, message);
    }

    /** Add a socket to this namespace. */
    addSocket(socket: PPClientSocket): PPNamespacedSocket {
        const nsSocket = new PPNamespacedSocket(socket, this);
        this.sockets.set(socket.id, nsSocket);
        this.emit("connection", nsSocket);
        return nsSocket;
    }

    /** Remove a socket from this namespace. */
    removeSocket(socketId: string): void {
        this.sockets.delete(socketId);
    }

    /** Get a connected socket in this namespace by ID. */
    getSocket(socketId: string): PPNamespacedSocket | undefined {
        return this.sockets.get(socketId);
    }

    /** Get all connected sockets in this namespace. */
    get connectedSockets(): Map<string, PPNamespacedSocket> {
        return this.sockets;
    }

    /** Broadcast to all sockets in this namespace. */
    broadcast(message: PPMessage, excludeId?: string): void {
        for (const [id, nsSocket] of this.sockets) {
            if (id === excludeId) continue;
            nsSocket.send(message);
        }
    }

    /** Emit a volatile broadcast (drop if client busy). */
    broadcastVolatile(message: PPMessage, excludeId?: string): void {
        for (const [id, nsSocket] of this.sockets) {
            if (id === excludeId) continue;
            nsSocket.send(message, { volatile: true });
        }
    }

    on(event: string, listener: EventHandler): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
    }

    off(event: string, listener: EventHandler): void {
        this.listeners.get(event)?.delete(listener);
    }

    /** #4: Listen to all events. */
    onAny(listener: (event: string, ...args: unknown[]) => void): void {
        this.anyListeners.add(listener);
    }

    offAny(listener: (event: string, ...args: unknown[]) => void): void {
        this.anyListeners.delete(listener);
    }

    emit(event: string, ...args: unknown[]): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(...args);
            }
        }
        // Catch-all
        for (const handler of this.anyListeners) {
            handler(event, ...args);
        }
    }
}

// ---- Namespaced Socket (wraps PPClientSocket with namespace features) ----

/**
 * A socket scoped to a specific namespace.
 * Provides ack callbacks, catch-all listeners, volatile sends.
 */
export class PPNamespacedSocket {
    readonly id: string;
    readonly namespace: PPNamespace;
    private socket: PPClientSocket;
    private ackCallbacks = new Map<number, { callback: PPAckCallback; timer: ReturnType<typeof setTimeout> }>();
    private anyListeners: Set<(event: string, ...args: unknown[]) => void> = new Set();
    private listeners = new Map<string, Set<EventHandler>>();
    private ackTimeout: number;

    constructor(socket: PPClientSocket, namespace: PPNamespace, ackTimeout = 10_000) {
        this.id = socket.id;
        this.socket = socket;
        this.namespace = namespace;
        this.ackTimeout = ackTimeout;
    }

    /**
     * Send a message, optionally with acknowledgement callback.
     * #2 Ack: If a callback is provided, the recipient can acknowledge the message.
     * #5 Volatile: If `options.volatile` is true, the message is silently dropped on failure.
     */
    send<T = unknown>(message: PPMessage<T>, options?: PPSendOptions): void;
    send<T = unknown>(message: PPMessage<T>, callback?: PPAckCallback): void;
    send<T = unknown>(message: PPMessage<T>, optionsOrCallback?: PPSendOptions | PPAckCallback): void {
        const isCallback = typeof optionsOrCallback === "function";
        const options: PPSendOptions = isCallback ? {} : (optionsOrCallback ?? {});
        const callback: PPAckCallback | undefined = isCallback ? optionsOrCallback : undefined;

        // Prepare the wire message
        const wireMsg: PPAckMessage<T> = { ...message };

        // Attach namespace if not default
        if (this.namespace.name !== "/") {
            (wireMsg as any).__ns = this.namespace.name;
        }

        // Attach ack ID if callback provided
        if (callback) {
            const ackId = ++globalAckCounter;
            wireMsg.__ackId = ackId;

            // Set timeout for ack (10s default)
            const timer = setTimeout(() => {
                this.ackCallbacks.delete(ackId);
                callback(new PPError("TIMEOUT_ERROR", `Ack timeout for message ${message.type}`, {
                    clientId: this.id,
                    namespace: this.namespace.name,
                    ackId,
                }));
            }, this.ackTimeout);

            this.ackCallbacks.set(ackId, { callback, timer });
        }

        try {
            this.socket.send(wireMsg as PPMessage);
        } catch (e) {
            if (options.volatile) {
                // #5: Silently drop volatile messages
                return;
            }
            throw e;
        }
    }

    /** Resolve an incoming ack response. */
    resolveAck(ackId: number, ...args: any[]): void {
        const entry = this.ackCallbacks.get(ackId);
        if (entry) {
            clearTimeout(entry.timer);
            this.ackCallbacks.delete(ackId);
            entry.callback(null, ...args);
        }
    }

    /** Send an ack response back to the sender. */
    sendAck(ackId: number, ...args: any[]): void {
        this.socket.send({
            type: "__pp_ack",
            payload: { ackId, args },
        });
    }

    /** Close the underlying socket. */
    close(code?: number, reason?: string): void {
        // Cleanup ack timers
        for (const [, entry] of this.ackCallbacks) {
            clearTimeout(entry.timer);
        }
        this.ackCallbacks.clear();
        this.socket.close(code, reason);
    }

    // --- Event emitter with catch-all (#4) ---

    on(event: string, listener: EventHandler): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
    }

    off(event: string, listener: EventHandler): void {
        this.listeners.get(event)?.delete(listener);
    }

    /** #4: Listen to all events on this socket. */
    onAny(listener: (event: string, ...args: unknown[]) => void): void {
        this.anyListeners.add(listener);
    }

    offAny(listener: (event: string, ...args: unknown[]) => void): void {
        this.anyListeners.delete(listener);
    }

    emit(event: string, ...args: unknown[]): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(...args);
            }
        }
        // Catch-all (#4)
        for (const handler of this.anyListeners) {
            handler(event, ...args);
        }
    }

    /** Get the underlying raw socket (for low-level access). */
    get rawSocket(): PPClientSocket {
        return this.socket;
    }
}
