/**
 * @painda/testing — Test utilities for PaindaProtocol.
 * 
 * Usage:
 *   import { createTestEnv, waitFor } from "@painda/testing";
 * 
 *   const { server, client, cleanup } = await createTestEnv();
 *   client.send({ type: "chat", payload: "hi" });
 *   const msg = await client.waitForMessage("chat");
 *   cleanup();
 */

import { PPServer, type PPServerOptions, type PPMessage } from "@painda/core";
import { PPClient } from "@painda/client";

export interface TestEnvOptions {
    /** Override server options. Port defaults to random. */
    serverOptions?: Partial<PPServerOptions>;
    /** Override client options. */
    clientUrl?: string;
    /** Auto-connect client. Default: true */
    autoConnect?: boolean;
}

export interface TestEnv {
    server: PPServer;
    client: PPClient;
    port: number;
    cleanup: () => void;
}

/**
 * Create a test server + client pair on a random port.
 * Returns a cleanup function that closes both.
 */
export async function createTestEnv(options?: TestEnvOptions): Promise<TestEnv> {
    // Use a random high port
    const port = options?.serverOptions?.port ?? (10000 + Math.floor(Math.random() * 50000));

    const server = new PPServer({
        port,
        heartbeatInterval: 0, // Disable heartbeat in tests
        ...options?.serverOptions,
    });

    // Wait a tick for the server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    const clientUrl = options?.clientUrl ?? `ws://localhost:${port}`;
    const autoConnect = options?.autoConnect ?? true;

    let client: PPClient;
    if (autoConnect) {
        client = new PPClient({ url: clientUrl, reconnect: false });
        // Wait for connection
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Test client connection timeout")), 5000);
            client.on("open", () => {
                clearTimeout(timeout);
                resolve();
            });
            client.on("error", (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    } else {
        client = new PPClient({ url: clientUrl, reconnect: false });
    }

    const cleanup = () => {
        client.close();
        server.close();
    };

    return { server, client, port, cleanup };
}

/**
 * Wait for a specific message type from a client.
 */
export function waitForMessage<T = unknown>(
    client: PPClient,
    type: string,
    timeoutMs = 5000,
): Promise<PPMessage<T>> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error(`Timeout waiting for message type "${type}"`)),
            timeoutMs,
        );

        const handler = (msg: PPMessage) => {
            if (msg.type === type) {
                clearTimeout(timeout);
                client.off("message", handler);
                resolve(msg as PPMessage<T>);
            }
        };

        client.on("message", handler);
    });
}

/**
 * Collect N messages from a client.
 */
export function collectMessages(
    client: PPClient,
    count: number,
    timeoutMs = 5000,
): Promise<PPMessage[]> {
    return new Promise((resolve, reject) => {
        const messages: PPMessage[] = [];
        const timeout = setTimeout(
            () => reject(new Error(`Timeout: collected ${messages.length}/${count} messages`)),
            timeoutMs,
        );

        const handler = (msg: PPMessage) => {
            messages.push(msg);
            if (messages.length >= count) {
                clearTimeout(timeout);
                client.off("message", handler);
                resolve(messages);
            }
        };

        client.on("message", handler);
    });
}

/**
 * Create multiple test clients connected to the same server.
 */
export async function createTestClients(
    port: number,
    count: number,
): Promise<{ clients: PPClient[]; cleanup: () => void }> {
    const clients: PPClient[] = [];

    for (let i = 0; i < count; i++) {
        const client = new PPClient({
            url: `ws://localhost:${port}`,
            reconnect: false,
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Client ${i} connection timeout`)), 5000);
            client.on("open", () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        clients.push(client);
    }

    return {
        clients,
        cleanup: () => clients.forEach((c) => c.close()),
    };
}

/**
 * Utility: wait for a condition to become true (polling).
 */
export function waitFor(
    condition: () => boolean | Promise<boolean>,
    timeoutMs = 5000,
    intervalMs = 50,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
        const check = async () => {
            try {
                if (await condition()) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(check, intervalMs);
                }
            } catch (err) {
                clearTimeout(timeout);
                reject(err);
            }
        };
        check();
    });
}

/**
 * Assert that a condition holds true, with a descriptive error.
 */
export function ppAssert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`PPTest Assertion Failed: ${message}`);
    }
}
