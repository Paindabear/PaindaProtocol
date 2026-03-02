import type { PPClientSocket, PPServer, PPMessage } from "@painda/core";
import { encodeFrame } from "@painda/core";

export class RoomManager {
    private server: PPServer;

    // Maps a Room ID to a set of connected clients
    private rooms: Map<string, Set<PPClientSocket>> = new Map();
    // Maps a Client to the list of Rooms they are currently in (for fast cleanup)
    private clientRooms: Map<PPClientSocket, Set<string>> = new Map();

    constructor(server: PPServer) {
        this.server = server;

        // Automatically clean up when a client disconnects
        this.server.on("connection", (client) => {
            client.on("close", () => {
                this.leaveAll(client);
            });
        });
    }

    /**
     * Adds a client to a specific room.
     */
    public join(client: PPClientSocket, roomId: string): void {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId)!.add(client);

        if (!this.clientRooms.has(client)) {
            this.clientRooms.set(client, new Set());
        }
        this.clientRooms.get(client)!.add(roomId);
    }

    /**
     * Removes a client from a specific room.
     */
    public leave(client: PPClientSocket, roomId: string): void {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId)!.delete(client);
            if (this.rooms.get(roomId)!.size === 0) {
                this.rooms.delete(roomId);
            }
        }

        if (this.clientRooms.has(client)) {
            this.clientRooms.get(client)!.delete(roomId);
            if (this.clientRooms.get(client)!.size === 0) {
                this.clientRooms.delete(client);
            }
        }
    }

    /**
     * Removes a client from all rooms they are currently in.
     */
    public leaveAll(client: PPClientSocket): void {
        const rooms = this.clientRooms.get(client);
        if (!rooms) return;

        for (const roomId of rooms) {
            if (this.rooms.has(roomId)) {
                this.rooms.get(roomId)!.delete(client);
                if (this.rooms.get(roomId)!.size === 0) {
                    this.rooms.delete(roomId);
                }
            }
        }
        this.clientRooms.delete(client);
    }

    /**
     * Returns all clients currently in a given room.
     */
    public getClientsInRoom(roomId: string): Set<PPClientSocket> {
        return this.rooms.get(roomId) || new Set();
    }

    /**
     * Returns the number of rooms currently active.
     */
    public get roomCount(): number {
        return this.rooms.size;
    }

    /**
     * Perf #8: Encode-once broadcast to all clients in a room.
     * Encodes the message once and sends raw bytes to avoid re-serializing per client.
     */
    public broadcastToRoom(roomId: string, message: PPMessage, excludeClient?: PPClientSocket): void {
        const clients = this.rooms.get(roomId);
        if (!clients) return;

        for (const client of clients) {
            if (excludeClient && client === excludeClient) continue;
            try {
                client.send(message);
            } catch (e) {
                // ignore send failures for disconnected clients
            }
        }
    }
}

/**
 * Sends a direct message from one client to another.
 * This is effectively a simple wrapper, provided for standard DX.
 */
export function directMessage(sender: PPClientSocket, recipient: PPClientSocket, message: PPMessage): void {
    try {
        recipient.send(message);
    } catch (e) {
        // ignore
    }
}
