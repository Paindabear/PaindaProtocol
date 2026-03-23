/**
 * Plugin System for PaindaProtocol.
 * 
 * Plugins get full access to the server lifecycle and can hook into
 * connections, messages, rooms, and more. This lets the community
 * build custom extensions without forking core.
 * 
 * Usage:
 *   const myPlugin: PPPlugin = {
 *     name: "my-plugin",
 *     version: "1.0.0",
 *     install(server, options) {
 *       server.use((socket, next) => { ... });
 *       server.on("connection", (client) => { ... });
 *     }
 *   };
 *   server.register(myPlugin, { someOption: true });
 */

import type { PPMessage, PPClientSocket } from "./types.js";

// ---- Plugin Lifecycle Hooks ----

export interface PPPluginHooks {
    /** Called when a client connects (after middleware). */
    onConnect?: (socket: PPClientSocket) => void | Promise<void>;

    /** Called when a client disconnects. */
    onDisconnect?: (socket: PPClientSocket) => void | Promise<void>;

    /** Called for every incoming message. Return false to block the message. */
    onMessage?: (socket: PPClientSocket, message: PPMessage) => boolean | void | Promise<boolean | void>;

    /** Called for every outgoing message (before encoding). */
    onSend?: (socket: PPClientSocket, message: PPMessage) => PPMessage | void;

    /** Called when a client joins a room. */
    onRoomJoin?: (socket: PPClientSocket, room: string) => void | Promise<void>;

    /** Called when a client leaves a room. */
    onRoomLeave?: (socket: PPClientSocket, room: string) => void | Promise<void>;

    /** Called when the server starts shutting down. */
    onShutdown?: () => void | Promise<void>;

    /** Called on server errors. */
    onError?: (error: Error, socket?: PPClientSocket) => void;
}

// ---- Plugin Interface ----

export interface PPPlugin<TOptions = unknown> {
    /** Unique plugin name, e.g. "rate-limiter" or "analytics". */
    name: string;

    /** Semver version string. */
    version: string;

    /** Optional dependencies — other plugin names that must be registered first. */
    dependencies?: string[];

    /**
     * Install the plugin. Called once when `server.register(plugin)` is invoked.
     * Gets full access to the server instance and user-provided options.
     * 
     * Return lifecycle hooks to participate in the request lifecycle,
     * or directly use `server.use()`, `server.on()`, etc.
     */
    install: (ctx: PPPluginContext, options?: TOptions) => PPPluginHooks | void;
}

// ---- Plugin Context (what the plugin receives) ----

/**
 * The context object passed to plugin.install().
 * Provides controlled access to server internals without exposing everything.
 */
export interface PPPluginContext {
    /** Register connection middleware. */
    use: (fn: (socket: PPClientSocket, next: (err?: Error) => void) => void | Promise<void>) => void;

    /** Register message middleware. */
    useMessage: (fn: (socket: PPClientSocket, message: PPMessage, next: (err?: Error) => void) => void | Promise<void>) => void;

    /** Listen to server events. */
    on: (event: string, handler: (...args: unknown[]) => void) => void;

    /** Get a reference to another plugin's public API. */
    getPlugin: <T = unknown>(name: string) => T | undefined;

    /** Expose a public API that other plugins can access. */
    expose: (api: Record<string, unknown>) => void;

    /** Server-level broadcast. */
    broadcast: (message: PPMessage, exclude?: PPClientSocket) => void;

    /** Get the count of connected clients. */
    getClientCount: () => number;

    /** Get a client by ID. */
    getClient: (id: string) => PPClientSocket | undefined;

    /** Log a message with the plugin name prefix. */
    log: (...args: unknown[]) => void;
}

// ---- Plugin Manager ----

export class PPPluginManager {
    private plugins = new Map<string, {
        plugin: PPPlugin;
        hooks: PPPluginHooks;
        api: Record<string, unknown>;
    }>();

    /** Register a plugin. Returns the manager for chaining. */
    register(plugin: PPPlugin, ctx: PPPluginContext, options?: unknown): this {
        if (this.plugins.has(plugin.name)) {
            throw new Error(`Plugin "${plugin.name}" is already registered`);
        }

        // Check dependencies
        if (plugin.dependencies) {
            for (const dep of plugin.dependencies) {
                if (!this.plugins.has(dep)) {
                    throw new Error(`Plugin "${plugin.name}" requires "${dep}" to be registered first`);
                }
            }
        }

        // Create a scoped context with expose functionality
        let pluginApi: Record<string, unknown> = {};
        const scopedCtx: PPPluginContext = {
            ...ctx,
            expose: (api) => { pluginApi = api; },
            getPlugin: <T>(name: string) => {
                const entry = this.plugins.get(name);
                return entry?.api as T | undefined;
            },
            log: (...args: unknown[]) => ctx.log(`[plugin:${plugin.name}]`, ...args),
        };

        const hooks = plugin.install(scopedCtx, options) ?? {};
        this.plugins.set(plugin.name, { plugin, hooks, api: pluginApi });

        return this;
    }

    /** Get a plugin's public API by name. */
    getPluginApi<T = unknown>(name: string): T | undefined {
        return this.plugins.get(name)?.api as T | undefined;
    }

    /** Check if a plugin is registered. */
    has(name: string): boolean {
        return this.plugins.has(name);
    }

    /** Get all registered plugin names. */
    getNames(): string[] {
        return [...this.plugins.keys()];
    }

    // ---- Lifecycle dispatch ----

    async dispatchConnect(socket: PPClientSocket): Promise<void> {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onConnect) await hooks.onConnect(socket);
        }
    }

    async dispatchDisconnect(socket: PPClientSocket): Promise<void> {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onDisconnect) await hooks.onDisconnect(socket);
        }
    }

    /**
     * Dispatch a message to all plugins. Returns false if any plugin blocks it.
     */
    async dispatchMessage(socket: PPClientSocket, message: PPMessage): Promise<boolean> {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onMessage) {
                const result = await hooks.onMessage(socket, message);
                if (result === false) return false;
            }
        }
        return true;
    }

    dispatchSend(socket: PPClientSocket, message: PPMessage): PPMessage {
        let msg = message;
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onSend) {
                const transformed = hooks.onSend(socket, msg);
                if (transformed) msg = transformed;
            }
        }
        return msg;
    }

    async dispatchRoomJoin(socket: PPClientSocket, room: string): Promise<void> {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onRoomJoin) await hooks.onRoomJoin(socket, room);
        }
    }

    async dispatchRoomLeave(socket: PPClientSocket, room: string): Promise<void> {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onRoomLeave) await hooks.onRoomLeave(socket, room);
        }
    }

    async dispatchShutdown(): Promise<void> {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onShutdown) await hooks.onShutdown();
        }
    }

    dispatchError(error: Error, socket?: PPClientSocket): void {
        for (const [, { hooks }] of this.plugins) {
            if (hooks.onError) hooks.onError(error, socket);
        }
    }
}
