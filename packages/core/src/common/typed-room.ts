/**
 * Typed Rooms with automatic Delta Sync.
 * 
 * The killer feature: a Room has a typed state object, and PaindaProtocol
 * automatically computes and broadcasts deltas to all members at 60 FPS.
 * 
 * Usage:
 *   const lobby = server.room<GameState>("lobby-1", { maxClients: 10 });
 *   lobby.state.update(s => { s.phase = "playing"; });
 *   // → Delta automatically broadcast to all clients in the room
 */

import type { PPMessage, PPClientSocket } from "./types.js";

/** Simple recursive diff — returns only changed keys. */
function diff(prev: any, next: any): any {
    if (prev === next) return undefined;
    if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) {
        return next;
    }
    if (Array.isArray(prev) || Array.isArray(next)) {
        const a = prev as unknown[];
        const b = next as unknown[];
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) return next;
        return undefined;
    }
    const result: Record<string, unknown> = {};
    let hasChanges = false;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of allKeys) {
        if (!(key in next)) {
            result[key] = null; // deleted
            hasChanges = true;
        } else {
            const d = diff(prev[key], next[key]);
            if (d !== undefined) {
                result[key] = d;
                hasChanges = true;
            }
        }
    }
    return hasChanges ? result : undefined;
}

type EventHandler = (...args: unknown[]) => void;

/** Custom diff function type. */
export type PPDiffAlgorithm = "shallow" | "deep" | ((prev: any, next: any) => any);

/** Policy when room is full. */
export type PPRoomFullPolicy = "reject" | "kick-oldest";

export interface TypedRoomOptions {
    /** Maximum number of clients in this room. 0 = unlimited. Default: 0 */
    maxClients?: number;
    /** Tick rate for state sync in ms. Default: ~16ms (60 FPS) */
    tickRate?: number;
    /** If true, new clients get the full state on join. Default: true */
    syncOnJoin?: boolean;
    /** Custom metadata for the room. */
    metadata?: Record<string, unknown>;
    /** Per-room authorization. Return false to reject. */
    auth?: (socket: PPClientSocket) => boolean | Promise<boolean>;
    /** Diff algorithm: "shallow" (top-level only), "deep" (recursive), or custom fn. Default: "deep" */
    diffAlgorithm?: PPDiffAlgorithm;
    /** What to do when the room is full: "reject" (deny join) or "kick-oldest" (remove first client). Default: "reject" */
    onFull?: PPRoomFullPolicy;
}

export class PPTypedRoom<TState extends object> {
    readonly id: string;
    private clients = new Map<string, PPClientSocket>();
    private _state: TState;
    private lastState: TState;
    private opts: {
        maxClients: number;
        tickRate: number;
        syncOnJoin: boolean;
        metadata: Record<string, unknown>;
        auth?: (socket: PPClientSocket) => boolean | Promise<boolean>;
        diffAlgorithm: PPDiffAlgorithm;
        onFull: PPRoomFullPolicy;
    };
    private tickTimer: ReturnType<typeof setInterval> | null = null;
    private listeners = new Map<string, Set<EventHandler>>();
    private _locked = false;
    private joinOrder: string[] = [];

    constructor(id: string, initialState: TState, options?: TypedRoomOptions) {
        this.id = id;
        this._state = structuredClone(initialState);
        this.lastState = structuredClone(initialState);
        this.opts = {
            maxClients: options?.maxClients ?? 0,
            tickRate: options?.tickRate ?? 16,
            syncOnJoin: options?.syncOnJoin ?? true,
            metadata: options?.metadata ?? {},
            auth: options?.auth,
            diffAlgorithm: options?.diffAlgorithm ?? "deep",
            onFull: options?.onFull ?? "reject",
        };
    }

    start(): void {
        if (this.tickTimer) return;
        this.tickTimer = setInterval(() => this.tick(), this.opts.tickRate);
    }

    stop(): void {
        if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    }

    async join(client: PPClientSocket): Promise<boolean> {
        if (this._locked) return false;

        // Auth check
        if (this.opts.auth) {
            const allowed = await this.opts.auth(client);
            if (!allowed) return false;
        }

        if (this.clients.has(client.id)) return true;

        // Full check
        if (this.opts.maxClients > 0 && this.clients.size >= this.opts.maxClients) {
            if (this.opts.onFull === "kick-oldest" && this.joinOrder.length > 0) {
                const oldestId = this.joinOrder.shift()!;
                const oldest = this.clients.get(oldestId);
                if (oldest) {
                    this.clients.delete(oldestId);
                    this.emit("leave", oldest);
                }
            } else {
                return false;
            }
        }

        this.clients.set(client.id, client);
        this.joinOrder.push(client.id);

        if (this.clients.size === 1) this.start();

        if (this.opts.syncOnJoin) {
            client.send({
                type: "__pp_room_state",
                payload: { room: this.id, state: this._state, full: true },
            });
        }

        this.emit("join", client);
        return true;
    }

    leave(client: PPClientSocket): void {
        if (!this.clients.has(client.id)) return;
        this.clients.delete(client.id);
        this.joinOrder = this.joinOrder.filter((id) => id !== client.id);
        this.emit("leave", client);
        if (this.clients.size === 0) this.stop();
    }

    lock(): void { this._locked = true; }
    unlock(): void { this._locked = false; }
    get locked(): boolean { return this._locked; }

    update(updater: (state: TState) => void): void { updater(this._state); }
    setState(newState: TState): void { this._state = structuredClone(newState); }
    getState(): Readonly<TState> { return this._state; }
    getClients(): PPClientSocket[] { return [...this.clients.values()]; }
    get clientCount(): number { return this.clients.size; }
    has(clientId: string): boolean { return this.clients.has(clientId); }

    broadcast(message: PPMessage, excludeId?: string): void {
        for (const [id, client] of this.clients) {
            if (id === excludeId) continue;
            client.send(message);
        }
    }

    get metadata(): Record<string, unknown> { return this.opts.metadata; }
    set metadata(data: Record<string, unknown>) { this.opts.metadata = data; }

    dispose(): void {
        this.stop();
        this.clients.clear();
        this.listeners.clear();
        this.joinOrder = [];
    }

    // ---- Internal tick ----

    private tick(): void {
        if (this.clients.size === 0) return;

        const d = this.computeDiff(this.lastState, this._state);
        if (d === undefined) return;

        this.lastState = structuredClone(this._state);

        const msg: PPMessage = { type: "__pp_room_delta", payload: { room: this.id, delta: d } };
        for (const [, client] of this.clients) {
            try { client.send(msg); } catch { /* ignore */ }
        }
        this.emit("tick", d);
    }

    private computeDiff(prev: any, next: any): any {
        if (typeof this.opts.diffAlgorithm === "function") {
            return this.opts.diffAlgorithm(prev, next);
        }
        if (this.opts.diffAlgorithm === "shallow") {
            return shallowDiff(prev, next);
        }
        return diff(prev, next);
    }

    on(event: string, handler: EventHandler): void {
        if (!this.listeners.has(event)) this.listeners.set(event, new Set());
        this.listeners.get(event)!.add(handler);
    }
    off(event: string, handler: EventHandler): void { this.listeners.get(event)?.delete(handler); }
    private emit(event: string, ...args: unknown[]): void {
        const handlers = this.listeners.get(event);
        if (handlers) { for (const h of handlers) h(...args); }
    }
}

/** Shallow diff — only compares top-level keys. */
function shallowDiff(prev: any, next: any): any {
    if (prev === next) return undefined;
    if (typeof prev !== "object" || typeof next !== "object") return next;
    const result: Record<string, unknown> = {};
    let hasChanges = false;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    for (const key of allKeys) {
        if (prev[key] !== next[key]) {
            result[key] = next[key] ?? null;
            hasChanges = true;
        }
    }
    return hasChanges ? result : undefined;
}

/**
 * Manages all typed rooms on a server.
 */
export class PPRoomManager {
    private rooms = new Map<string, PPTypedRoom<any>>();

    /** Create or get a typed room. */
    room<TState extends object>(
        id: string,
        initialState: TState,
        options?: TypedRoomOptions,
    ): PPTypedRoom<TState> {
        if (this.rooms.has(id)) {
            return this.rooms.get(id) as PPTypedRoom<TState>;
        }
        const room = new PPTypedRoom<TState>(id, initialState, options);
        this.rooms.set(id, room);
        return room;
    }

    /** Get an existing room by ID. */
    get<TState extends object>(id: string): PPTypedRoom<TState> | undefined {
        return this.rooms.get(id) as PPTypedRoom<TState> | undefined;
    }

    /** Delete a room and dispose it. */
    delete(id: string): boolean {
        const room = this.rooms.get(id);
        if (room) {
            room.dispose();
            this.rooms.delete(id);
            return true;
        }
        return false;
    }

    /** Remove a client from all rooms. */
    leaveAll(client: PPClientSocket): void {
        for (const [, room] of this.rooms) {
            room.leave(client);
        }
    }

    /** Get all room IDs. */
    getRoomIds(): string[] {
        return [...this.rooms.keys()];
    }

    /** Get total room count. */
    get size(): number {
        return this.rooms.size;
    }

    /** Dispose all rooms. */
    dispose(): void {
        for (const [, room] of this.rooms) {
            room.dispose();
        }
        this.rooms.clear();
    }
}
