/**
 * Presence System — tracks who's online and their metadata.
 * 
 * Like Phoenix Channels Presence: track arbitrary user data
 * (status, cursor position, typing indicator) and get notified
 * when the presence map changes.
 * 
 * Usage:
 *   server.presence.track(socket, { status: "online", name: "Alex" });
 *   server.presence.onChange((presences) => { ... });
 *   server.presence.untrack(socket);
 */

import type { PPClientSocket, PPMessage } from "./types.js";

type EventHandler = (...args: unknown[]) => void;

export interface PresenceData {
    [key: string]: unknown;
}

export interface PresenceEntry {
    clientId: string;
    data: PresenceData;
    joinedAt: number;
    updatedAt: number;
}

export interface PresenceOptions {
    /** How often to broadcast presence sync (ms). Default: 2000 */
    syncInterval?: number;
    /** If true, broadcast presence on change. Default: true */
    broadcastOnChange?: boolean;
    /** Sync mode: "full" sends entire list, "diff" sends only changes. Default: "full" */
    syncMode?: "full" | "diff";
    /** Max size of metadata per client (chars, JSON-stringified). 0 = unlimited. Default: 0 */
    maxMetadataSize?: number;
}

export class PPPresence {
    private entries = new Map<string, PresenceEntry>();
    private sockets = new Map<string, PPClientSocket>();
    private listeners = new Map<string, Set<EventHandler>>();
    private syncTimer: ReturnType<typeof setInterval> | null = null;
    private dirty = false;
    private options: Required<Pick<PresenceOptions, "syncInterval" | "broadcastOnChange" | "syncMode" | "maxMetadataSize">>;
    private pendingChanges: Array<{ type: "join" | "leave" | "update"; clientId: string; data?: PresenceData }> = [];

    constructor(options?: PresenceOptions) {
        this.options = {
            syncInterval: options?.syncInterval ?? 2000,
            broadcastOnChange: options?.broadcastOnChange ?? true,
            syncMode: options?.syncMode ?? "full",
            maxMetadataSize: options?.maxMetadataSize ?? 0,
        };

        // Periodic sync
        this.syncTimer = setInterval(() => {
            if (this.dirty) {
                this.broadcastPresence();
                this.dirty = false;
            }
        }, this.options.syncInterval);
    }

    /**
     * Track a client's presence with arbitrary metadata.
     * Called when a user comes online or their status changes.
     */
    track(socket: PPClientSocket, data: PresenceData): void {
        // Enforce metadata size limit
        if (this.options.maxMetadataSize > 0) {
            const size = JSON.stringify(data).length;
            if (size > this.options.maxMetadataSize) {
                throw new Error(`Presence metadata exceeds max size (${size} > ${this.options.maxMetadataSize})`);
            }
        }

        const existing = this.entries.get(socket.id);
        const now = Date.now();

        this.entries.set(socket.id, {
            clientId: socket.id,
            data,
            joinedAt: existing?.joinedAt ?? now,
            updatedAt: now,
        });
        this.sockets.set(socket.id, socket);
        this.dirty = true;

        if (!existing) {
            this.pendingChanges.push({ type: "join", clientId: socket.id, data });
            this.emit("join", socket.id, data);
        } else {
            this.pendingChanges.push({ type: "update", clientId: socket.id, data });
            this.emit("update", socket.id, data);
        }
    }

    /**
     * Update a client's presence data (partial merge).
     */
    update(socketId: string, data: Partial<PresenceData>): void {
        const entry = this.entries.get(socketId);
        if (!entry) return;

        Object.assign(entry.data, data);
        entry.updatedAt = Date.now();
        this.dirty = true;

        this.pendingChanges.push({ type: "update", clientId: socketId, data: entry.data });
        this.emit("update", socketId, entry.data);
    }

    /**
     * Remove a client from the presence list.
     */
    untrack(socketOrId: PPClientSocket | string): void {
        const id = typeof socketOrId === "string" ? socketOrId : socketOrId.id;
        const entry = this.entries.get(id);
        if (!entry) return;

        this.entries.delete(id);
        this.sockets.delete(id);
        this.dirty = true;

        this.pendingChanges.push({ type: "leave", clientId: id, data: entry.data });
        this.emit("leave", id, entry.data);
    }

    /**
     * Get the presence data for a specific client.
     */
    get(clientId: string): PresenceEntry | undefined {
        return this.entries.get(clientId);
    }

    /**
     * Get all presence entries as an array.
     */
    list(): PresenceEntry[] {
        return [...this.entries.values()];
    }

    /**
     * Get all presence entries as a map (clientId → data).
     */
    toMap(): Map<string, PresenceData> {
        const map = new Map<string, PresenceData>();
        for (const [id, entry] of this.entries) {
            map.set(id, entry.data);
        }
        return map;
    }

    /**
     * Get the number of tracked presences.
     */
    get count(): number {
        return this.entries.size;
    }

    /**
     * Broadcast the full presence list to all tracked clients.
     */
    private broadcastPresence(): void {
        if (!this.options.broadcastOnChange) return;

        if (this.options.syncMode === "diff" && this.pendingChanges.length > 0) {
            // Diff mode: only send changes
            const msg: PPMessage = {
                type: "__pp_presence_diff",
                payload: { changes: this.pendingChanges },
            };
            for (const [, socket] of this.sockets) {
                try { socket.send(msg); } catch { /* ignore */ }
            }
            this.pendingChanges = [];
        } else {
            // Full mode: send entire list
            const presenceList = this.list();
            const msg: PPMessage = {
                type: "__pp_presence",
                payload: { presences: presenceList },
            };
            for (const [, socket] of this.sockets) {
                try { socket.send(msg); } catch { /* ignore */ }
            }
            this.pendingChanges = [];
        }
    }

    /**
     * Force an immediate presence sync broadcast.
     */
    sync(): void {
        this.broadcastPresence();
        this.dirty = false;
    }

    // ---- Event Emitter ----

    /** Listen to presence changes: "join", "leave", "update", "change" */
    on(event: string, handler: EventHandler): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(handler);
    }

    off(event: string, handler: EventHandler): void {
        this.listeners.get(event)?.delete(handler);
    }

    /** Shorthand for listening to all changes (join + leave + update). */
    onChange(handler: (presences: PresenceEntry[]) => void): void {
        const wrapper = () => handler(this.list());
        this.on("join", wrapper);
        this.on("leave", wrapper);
        this.on("update", wrapper);
    }

    private emit(event: string, ...args: unknown[]): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const h of handlers) h(...args);
        }
    }

    /** Cleanup. */
    dispose(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        this.entries.clear();
        this.sockets.clear();
        this.listeners.clear();
    }
}
