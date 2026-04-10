import type { PPMessage } from "./types.js";
import { EventEmitter } from "events";
import { decodeFrame, encodeFrame } from "./frame.js";

/**
 * PPVirtualClient acts as a headless client that connects to the server
 * directly in memory without WebSocket overhead. Useful for bots, SSR, or testing.
 */
export class PPVirtualClient {
    public readonly id: string;
    private emitter = new EventEmitter();
    private fakeWs?: EventEmitter & { send?: (data: any) => void; close?: () => void };

    // Mock options if needed
    public registry?: any;
    public mode: any = "chat";

    constructor(id?: string) {
        this.id = id ?? `virtual_${Math.random().toString(36).substring(2, 9)}`;
    }

    /** Connect directly to a PPServer instance */
    connect(server: any): void {
        if (!server || typeof server.inject !== "function") {
            throw new Error("PPVirtualClient.connect requires a valid PPServer instance");
        }
        server.inject(this);
    }

    send<T = unknown>(message: PPMessage<T>): void {
        if (!this.fakeWs) throw new Error("Virtual client is not connected");
        
        // Encode message identically to how PPClient does it
        const frame = encodeFrame(this.mode, message, this.registry, {});
        // Dispatch to server as if it came over the wire
        this.fakeWs.emit("message", frame, true);
    }

    on(event: string, handler: (...args: any[]) => void): void {
        this.emitter.on(event, handler);
    }

    off(event: string, handler: (...args: any[]) => void): void {
        this.emitter.off(event, handler);
    }

    /** Internal: called by PPServer when injecting */
    _attachServer(fakeWs: EventEmitter & { send?: (data: any) => void; close?: () => void }) {
        this.fakeWs = fakeWs;
        // The server will attach its own "message" listener to fakeWs to receive our data.
    }

    /** Internal: called by the mocked WebSocket when the server sends data */
    _receiveRaw(data: Uint8Array): void {
        const decoded = decodeFrame(data, this.registry);
        this.emitter.emit(decoded.message.type, decoded.message.payload);
        this.emitter.emit("message", decoded.message);
    }

    /** Internal: handle server closing the socket */
    _handleClose(): void {
        this.fakeWs = undefined;
        this.emitter.emit("close");
    }
}
