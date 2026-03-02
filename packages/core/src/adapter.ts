/**
 * #9: Adapter system for horizontal scaling.
 * Default: InMemoryAdapter (single-process).
 * For multi-instance: implement PPAdapter with Redis/Postgres/etc.
 */

import type { PPMessage } from "./types.js";

export interface PPAdapter {
    /**
     * Publish a message to all server instances for a given room.
     * This is called when broadcasting to a room.
     */
    publish(channel: string, message: PPMessage, excludeClientId?: string): Promise<void>;

    /**
     * Subscribe to messages from other server instances for a given channel.
     * The callback is invoked when a remote instance broadcasts to this channel.
     */
    subscribe(channel: string, callback: (message: PPMessage, excludeClientId?: string) => void): Promise<void>;

    /**
     * Unsubscribe from a channel.
     */
    unsubscribe(channel: string): Promise<void>;

    /**
     * Add a client to a room across all instances.
     */
    addToRoom(room: string, clientId: string): Promise<void>;

    /**
     * Remove a client from a room across all instances.
     */
    removeFromRoom(room: string, clientId: string): Promise<void>;

    /**
     * Get all client IDs in a room across all instances.
     */
    getClientsInRoom(room: string): Promise<Set<string>>;

    /**
     * Get all rooms a specific client is in.
     */
    getClientRooms(clientId: string): Promise<Set<string>>;

    /**
     * Cleanup when the adapter is no longer needed.
     */
    close(): Promise<void>;
}

/**
 * Default in-memory adapter for single-process deployments.
 * No inter-process communication — all data is local.
 */
export class InMemoryAdapter implements PPAdapter {
    private rooms = new Map<string, Set<string>>();
    private clientRooms = new Map<string, Set<string>>();
    private subscriptions = new Map<string, Set<(message: PPMessage, excludeClientId?: string) => void>>();

    async publish(channel: string, message: PPMessage, excludeClientId?: string): Promise<void> {
        const callbacks = this.subscriptions.get(channel);
        if (callbacks) {
            for (const cb of callbacks) {
                cb(message, excludeClientId);
            }
        }
    }

    async subscribe(channel: string, callback: (message: PPMessage, excludeClientId?: string) => void): Promise<void> {
        if (!this.subscriptions.has(channel)) {
            this.subscriptions.set(channel, new Set());
        }
        this.subscriptions.get(channel)!.add(callback);
    }

    async unsubscribe(channel: string): Promise<void> {
        this.subscriptions.delete(channel);
    }

    async addToRoom(room: string, clientId: string): Promise<void> {
        if (!this.rooms.has(room)) {
            this.rooms.set(room, new Set());
        }
        this.rooms.get(room)!.add(clientId);

        if (!this.clientRooms.has(clientId)) {
            this.clientRooms.set(clientId, new Set());
        }
        this.clientRooms.get(clientId)!.add(room);
    }

    async removeFromRoom(room: string, clientId: string): Promise<void> {
        const roomSet = this.rooms.get(room);
        if (roomSet) {
            roomSet.delete(clientId);
            if (roomSet.size === 0) this.rooms.delete(room);
        }

        const clientSet = this.clientRooms.get(clientId);
        if (clientSet) {
            clientSet.delete(room);
            if (clientSet.size === 0) this.clientRooms.delete(clientId);
        }
    }

    async getClientsInRoom(room: string): Promise<Set<string>> {
        return this.rooms.get(room) ?? new Set();
    }

    async getClientRooms(clientId: string): Promise<Set<string>> {
        return this.clientRooms.get(clientId) ?? new Set();
    }

    async close(): Promise<void> {
        this.rooms.clear();
        this.clientRooms.clear();
        this.subscriptions.clear();
    }
}
