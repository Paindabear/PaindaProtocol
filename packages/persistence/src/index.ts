import type { PPClientSocket, PPServer, PPMessage } from "@painda/core";

export interface PersistenceAdapter {
    saveMessage(type: string, payload: any, context?: any): Promise<void>;
    loadState(roomId: string): Promise<any>;
}

export interface PersistenceOptions {
    adapter: PersistenceAdapter;
    /** Types of messages to auto-persist. Default: ["chat-message", "game-state"] */
    syncTypes?: string[];
    /** If true, persistence failures are silently ignored. Default: true */
    silentErrors?: boolean;
    /** Batch size for write buffering. Default: 1 (immediate) */
    batchSize?: number;
}

/**
 * Feature #17 (partial): Persistence Middleware with basic metrics.
 * Automatically mirrors real-time state changes to a cold storage DB.
 */
export class PPPersistenceMiddleware {
    private server: PPServer;
    private options: PersistenceOptions;
    private writeBuffer: { type: string; payload: any; context: any }[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    /** Metrics counters */
    public metrics = {
        messagesReceived: 0,
        messagesPersisted: 0,
        persistenceErrors: 0,
    };

    constructor(server: PPServer, options: PersistenceOptions) {
        this.server = server;
        this.options = {
            syncTypes: ["chat-message", "game-state"],
            silentErrors: true,
            batchSize: 1,
            ...options,
        };
        this.applyHooks();
    }

    private applyHooks() {
        this.server.on("connection", (client: PPClientSocket) => {
            client.on("message", async (msg: PPMessage) => {
                this.metrics.messagesReceived++;

                if (this.options.syncTypes?.includes(msg.type)) {
                    const entry = { type: msg.type, payload: msg.payload, context: { clientId: client.id } };

                    if (this.options.batchSize && this.options.batchSize > 1) {
                        this.writeBuffer.push(entry);
                        if (this.writeBuffer.length >= this.options.batchSize) {
                            await this.flushBuffer();
                        } else if (!this.flushTimer) {
                            // Auto-flush after 100ms if batch isn't full
                            this.flushTimer = setTimeout(() => this.flushBuffer(), 100);
                        }
                    } else {
                        try {
                            await this.options.adapter.saveMessage(msg.type, msg.payload, { clientId: client.id });
                            this.metrics.messagesPersisted++;
                        } catch (e) {
                            this.metrics.persistenceErrors++;
                            if (!this.options.silentErrors) {
                                throw e;
                            }
                        }
                    }
                }
            });
        });
    }

    private async flushBuffer(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }

        const batch = this.writeBuffer.splice(0);
        for (const entry of batch) {
            try {
                await this.options.adapter.saveMessage(entry.type, entry.payload, entry.context);
                this.metrics.messagesPersisted++;
            } catch (e) {
                this.metrics.persistenceErrors++;
                if (!this.options.silentErrors) {
                    console.error("Persistence error:", e);
                }
            }
        }
    }

    /** Get current metrics snapshot */
    getMetrics() {
        return { ...this.metrics };
    }

    /** Reset metrics counters */
    resetMetrics() {
        this.metrics.messagesReceived = 0;
        this.metrics.messagesPersisted = 0;
        this.metrics.persistenceErrors = 0;
    }
}
