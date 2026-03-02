import type { PPClientSocket, PPServer } from "@painda/core";

export interface AuthOptions {
    /**
     * Function to validate a token. Should throw an error or return false if invalid.
     * Returning a user object is recommended — it will be attached to the socket as `userContext`.
     */
    validator: (token: string) => Promise<any | boolean> | any | boolean;

    /**
     * Optional fallback if no token is provided. Default: false
     */
    allowGuest?: boolean;

    /**
     * Timeout (ms) for the client to send an authenticate message. Default: 5000
     */
    authTimeout?: number;
}

/**
 * Authentication Middleware for PaindaProtocol.
 * Validates connections via an `authenticate` message before they are
 * considered "active" in the application layer.
 */
export class PPAuthMiddleware {
    private server: PPServer;
    private options: AuthOptions;
    private authenticated = new Set<string>();

    constructor(server: PPServer, options: AuthOptions) {
        this.server = server;
        this.options = options;
        this.applyInterceptor();
    }

    /** Check if a client has been authenticated */
    isAuthenticated(client: PPClientSocket): boolean {
        return this.authenticated.has(client.id);
    }

    private applyInterceptor() {
        this.server.on("connection", (client: PPClientSocket) => {
            const timeout = this.options.authTimeout ?? 5000;
            let authComplete = false;

            // Set a timeout: if client doesn't authenticate in time, disconnect
            const timer = setTimeout(() => {
                if (!authComplete) {
                    client.send({ type: "auth-error", payload: { error: "Authentication Timeout" } });
                    client.close(4001, "Auth timeout");
                }
            }, timeout);

            // Listen for the authenticate message
            const authHandler = async (msg: any) => {
                if (msg.type === "authenticate") {
                    try {
                        const token = msg.payload?.token;

                        if (!token && this.options.allowGuest) {
                            // Guest access allowed
                            (client as any).userContext = { guest: true };
                            authComplete = true;
                            clearTimeout(timer);
                            this.authenticated.add(client.id);
                            client.send({ type: "auth-success", payload: { success: true, guest: true } });
                            client.off("message", authHandler);
                            return;
                        }

                        if (!token) {
                            throw new Error("No token provided");
                        }

                        const result = await this.options.validator(token);

                        if (!result) throw new Error("Invalid Token");

                        // Attach user context to the socket
                        (client as any).userContext = result;
                        authComplete = true;
                        clearTimeout(timer);
                        this.authenticated.add(client.id);

                        client.send({ type: "auth-success", payload: { success: true } });

                        // Remove auth listener so we don't process it again
                        client.off("message", authHandler);
                    } catch (e) {
                        authComplete = true;
                        clearTimeout(timer);
                        client.send({ type: "auth-error", payload: { error: "Authentication Failed" } });
                        client.close(4002, "Auth failed");
                    }
                }
            };

            // FIXED: Actually register the handler (was commented out before!)
            client.on("message", authHandler);

            // Cleanup on disconnect
            client.on("close", () => {
                clearTimeout(timer);
                this.authenticated.delete(client.id);
            });
        });
    }
}
