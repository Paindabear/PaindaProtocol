import type { PPClientSocket, PPServer, PPMessage } from "@painda/core";

export type SignalType = "offer" | "answer" | "candidate" | "join" | "leave";

export interface RTCMessage {
    type: SignalType;
    roomId: string;
    senderId?: string;
    targetId?: string;
    payload?: any;
}

export class SignalingServer {
    private server: PPServer;

    // Maps a Room ID to a set of connected clients
    private rooms: Map<string, Set<PPClientSocket>> = new Map();

    constructor(server: PPServer) {
        this.server = server;

        this.server.on("connection", (client) => {
            client.on("close", () => this.handleDisconnect(client));
        });
    }

    /**
     * Processes an incoming signaling message and routes it to the correct peer(s).
     * It assumes the message is already decoded by PPClient.
     */
    public handleSignal(client: PPClientSocket, message: PPMessage<RTCMessage>): void {
        const data = message.payload;
        if (!data || !data.roomId || !data.type) return;

        data.senderId = client.id;

        switch (data.type) {
            case "join":
                this.join(client, data.roomId);
                // Notify others in the room
                this.broadcastToRoom(data.roomId, message, client);
                break;

            case "leave":
                this.leave(client, data.roomId);
                this.broadcastToRoom(data.roomId, message, client);
                break;

            case "offer":
            case "answer":
            case "candidate":
                // Direct routing to a specific peer
                if (data.targetId) {
                    this.sendToPeer(data.roomId, data.targetId, message);
                } else {
                    // Fallback: Broadcast if no target specified (e.g. mesh network style)
                    this.broadcastToRoom(data.roomId, message, client);
                }
                break;
        }
    }

    private join(client: PPClientSocket, roomId: string): void {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId)!.add(client);
    }

    private leave(client: PPClientSocket, roomId: string): void {
        const room = this.rooms.get(roomId);
        if (room) {
            room.delete(client);
            if (room.size === 0) {
                this.rooms.delete(roomId);
            }
        }
    }

    private handleDisconnect(client: PPClientSocket): void {
        // Collect affected rooms first to avoid mutating `this.rooms` during iteration
        const affectedRooms: string[] = [];
        for (const [roomId, clients] of this.rooms.entries()) {
            if (clients.has(client)) {
                affectedRooms.push(roomId);
            }
        }

        for (const roomId of affectedRooms) {
            this.leave(client, roomId);

            // Notify remaining peers that this user vanished
            const leaveMsg: PPMessage<RTCMessage> = {
                type: "rtc-signal",
                payload: { type: "leave", roomId, senderId: client.id }
            };
            this.broadcastToRoom(roomId, leaveMsg);
        }
    }

    private broadcastToRoom(roomId: string, message: PPMessage, excludeClient?: PPClientSocket): void {
        const clients = this.rooms.get(roomId);
        if (!clients) return;

        for (const peer of clients) {
            if (excludeClient && peer === excludeClient) continue;
            try { peer.send(message); } catch (e) { }
        }
    }

    private sendToPeer(roomId: string, targetId: string, message: PPMessage): void {
        const clients = this.rooms.get(roomId);
        if (!clients) return;

        for (const peer of clients) {
            if (peer.id === targetId) {
                try { peer.send(message); return; } catch (e) { }
            }
        }
    }
}
