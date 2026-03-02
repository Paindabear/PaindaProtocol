/**
 * #3: Middleware pipeline for PaindaProtocol.
 * Supports both connection-level and message-level middleware.
 */

import type { PPClientSocket, PPMessage } from "./types.js";

/** Connection middleware: runs when a client connects, before the `connection` event fires. */
export type PPConnectionMiddleware = (
    socket: PPClientSocket,
    next: (err?: Error) => void,
) => void | Promise<void>;

/** Message middleware: runs for every incoming message before handlers. */
export type PPMessageMiddleware = (
    socket: PPClientSocket,
    message: PPMessage,
    next: (err?: Error) => void,
) => void | Promise<void>;

export class PPMiddlewarePipeline {
    private connectionMiddlewares: PPConnectionMiddleware[] = [];
    private messageMiddlewares: PPMessageMiddleware[] = [];

    /**
     * Register a connection middleware.
     * Middlewares run in order. Call `next()` to proceed, `next(err)` to reject.
     */
    useConnection(fn: PPConnectionMiddleware): this {
        this.connectionMiddlewares.push(fn);
        return this;
    }

    /**
     * Register a message middleware.
     * Middlewares run in order. Call `next()` to proceed, `next(err)` to reject.
     */
    useMessage(fn: PPMessageMiddleware): this {
        this.messageMiddlewares.push(fn);
        return this;
    }

    /**
     * Execute the connection middleware chain for a socket.
     * Resolves if all middlewares pass, rejects with the first error.
     */
    async runConnection(socket: PPClientSocket): Promise<void> {
        return this.runChain(this.connectionMiddlewares, (fn, next) => fn(socket, next));
    }

    /**
     * Execute the message middleware chain for a message.
     * Resolves if all middlewares pass, rejects with the first error.
     */
    async runMessage(socket: PPClientSocket, message: PPMessage): Promise<void> {
        return this.runChain(this.messageMiddlewares, (fn, next) => fn(socket, message, next));
    }

    get connectionCount(): number {
        return this.connectionMiddlewares.length;
    }

    get messageCount(): number {
        return this.messageMiddlewares.length;
    }

    private runChain<T>(
        fns: T[],
        executor: (fn: T, next: (err?: Error) => void) => void | Promise<void>,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let index = 0;

            const next = (err?: Error) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (index >= fns.length) {
                    resolve();
                    return;
                }
                const fn = fns[index++];
                try {
                    const result = executor(fn, next);
                    // Support async middleware
                    if (result && typeof (result as Promise<void>).catch === "function") {
                        (result as Promise<void>).catch(reject);
                    }
                } catch (e) {
                    reject(e instanceof Error ? e : new Error(String(e)));
                }
            };

            next();
        });
    }
}
