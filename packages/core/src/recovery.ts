/**
 * #8: Connection State Recovery.
 * Buffers outgoing messages per client so that after a reconnect,
 * missed messages can be replayed. Also tracks room memberships.
 */

import type { PPMessage } from "./types.js";

export interface RecoveryOptions {
    /** Maximum number of messages to buffer per client. Default: 100 */
    maxBufferSize?: number;
    /** Time (ms) to keep recovery data after disconnect. Default: 120_000 (2 min) */
    retentionMs?: number;
}

interface RecoveryState {
    messages: { msg: PPMessage; offset: number }[];
    rooms: Set<string>;
    disconnectedAt: number | null;
    lastOffset: number;
}

export class PPRecoveryManager {
    private clients = new Map<string, RecoveryState>();
    private maxBufferSize: number;
    private retentionMs: number;
    private cleanupTimer: ReturnType<typeof setInterval>;

    constructor(options?: RecoveryOptions) {
        this.maxBufferSize = options?.maxBufferSize ?? 100;
        this.retentionMs = options?.retentionMs ?? 120_000;

        // Cleanup stale recovery data every 30s
        this.cleanupTimer = setInterval(() => this.cleanup(), 30_000);
    }

    /** Initialize recovery tracking for a new client. */
    track(clientId: string): void {
        if (!this.clients.has(clientId)) {
            this.clients.set(clientId, {
                messages: [],
                rooms: new Set(),
                disconnectedAt: null,
                lastOffset: 0,
            });
        }
    }

    /** Buffer a message that was sent to a client. */
    bufferMessage(clientId: string, message: PPMessage): number {
        const state = this.clients.get(clientId);
        if (!state) return -1;

        state.lastOffset++;
        state.messages.push({ msg: message, offset: state.lastOffset });

        // Evict oldest if over limit
        while (state.messages.length > this.maxBufferSize) {
            state.messages.shift();
        }

        return state.lastOffset;
    }

    /** Record a room membership change. */
    addRoom(clientId: string, room: string): void {
        this.clients.get(clientId)?.rooms.add(room);
    }

    /** Record a room leave. */
    removeRoom(clientId: string, room: string): void {
        this.clients.get(clientId)?.rooms.delete(room);
    }

    /** Mark a client as disconnected (starts retention timer). */
    markDisconnected(clientId: string): void {
        const state = this.clients.get(clientId);
        if (state) {
            state.disconnectedAt = Date.now();
        }
    }

    /**
     * Attempt to recover a client's session.
     * Returns missed messages and room memberships, or null if recovery is not possible.
     */
    recover(clientId: string, lastOffset: number): {
        messages: PPMessage[];
        rooms: string[];
    } | null {
        const state = this.clients.get(clientId);
        if (!state) return null;
        if (state.disconnectedAt === null) return null;

        // Check if retention window has expired
        if (Date.now() - state.disconnectedAt > this.retentionMs) {
            this.clients.delete(clientId);
            return null;
        }

        // Find messages after the given offset
        const missed = state.messages
            .filter((m) => m.offset > lastOffset)
            .map((m) => m.msg);

        // Mark as reconnected
        state.disconnectedAt = null;

        return {
            messages: missed,
            rooms: [...state.rooms],
        };
    }

    /** Get the current offset for a client (used by the client to track position). */
    getOffset(clientId: string): number {
        return this.clients.get(clientId)?.lastOffset ?? 0;
    }

    /** Remove recovery data for a client. */
    untrack(clientId: string): void {
        this.clients.delete(clientId);
    }

    /** Cleanup stale recovery data. */
    private cleanup(): void {
        const now = Date.now();
        for (const [id, state] of this.clients.entries()) {
            if (state.disconnectedAt !== null && now - state.disconnectedAt > this.retentionMs) {
                this.clients.delete(id);
            }
        }
    }

    close(): void {
        clearInterval(this.cleanupTimer);
        this.clients.clear();
    }
}
