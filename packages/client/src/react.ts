/**
 * usePP() — React Hook for PaindaProtocol
 *
 * Usage:
 * ```tsx
 * const { emit, on, connected, state } = usePP({
 *   url: "wss://example.com/ws",
 *   reconnect: true,
 * });
 *
 * // Subscribe to events
 * on("chat_message", (msg) => setChatMessages(prev => [...prev, msg]));
 *
 * // Send messages
 * emit("chat", { text: "Hello!" });
 * ```
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PPClient } from "./client.js";
import type { PPClientOptions, PPConnectionState, PPMessage } from "./types.js";
import { patchImmutable } from "@painda/gaming";

type EventHandler = (...args: any[]) => void;

export interface UsePPReturn {
    /** Send a typed message */
    emit: <T = unknown>(type: string, payload?: T) => boolean;

    /** Send a full PPMessage */
    send: <T = unknown>(message: PPMessage<T>) => boolean;

    /** Subscribe to a message type — returns unsubscribe function */
    on: (event: string, handler: EventHandler) => () => void;

    /** Whether the WebSocket is connected */
    connected: boolean;

    /** Connection state: "connecting" | "connected" | "disconnected" | "reconnecting" */
    state: PPConnectionState;

    /** Raw PPClient instance for advanced use */
    client: PPClient | null;
}

/**
 * React hook for PaindaProtocol client.
 * Handles connection lifecycle, cleanup on unmount, and reactive state.
 */
export function usePP(options: PPClientOptions): UsePPReturn {
    const [connected, setConnected] = useState(false);
    const [state, setState] = useState<PPConnectionState>("disconnected");
    const clientRef = useRef<PPClient | null>(null);
    const listenersRef = useRef<Array<{ event: string; handler: EventHandler }>>([]);

    // Stable references for the URL and options
    const optionsRef = useRef(options);
    optionsRef.current = options;

    // Create client on mount, destroy on unmount
    useEffect(() => {
        const client = new PPClient(optionsRef.current);
        clientRef.current = client;

        client.on("stateChange", (newState: PPConnectionState) => {
            setState(newState);
            setConnected(newState === "connected");
        });

        // Re-attach any listeners that were registered before client was ready
        for (const { event, handler } of listenersRef.current) {
            client.on(event, handler);
        }

        return () => {
            client.close();
            clientRef.current = null;
        };
        // Only recreate on URL change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options.url]);

    // Stable emit function
    const emit = useCallback(<T = unknown>(type: string, payload?: T): boolean => {
        return clientRef.current?.emit(type, payload) ?? false;
    }, []);

    // Stable send function
    const send = useCallback(<T = unknown>(message: PPMessage<T>): boolean => {
        return clientRef.current?.send(message) ?? false;
    }, []);

    /**
     * Subscribe to a message type. Returns an unsubscribe function.
     *
     * Designed to be used in useEffect:
     * ```tsx
     * useEffect(() => {
     *   const unsub = on("player_joined", (data) => setPlayers(data.players));
     *   return unsub;
     * }, [on]);
     * ```
     *
     * Or collect multiple:
     * ```tsx
     * useEffect(() => {
     *   const unsubs = [
     *     on("question", handleQuestion),
     *     on("reveal", handleReveal),
     *   ];
     *   return () => unsubs.forEach(u => u());
     * }, [on]);
     * ```
     */
    const on = useCallback((event: string, handler: EventHandler): (() => void) => {
        const entry = { event, handler };
        listenersRef.current.push(entry);

        // If client already exists, attach immediately
        clientRef.current?.on(event, handler);

        return () => {
            clientRef.current?.off(event, handler);
            listenersRef.current = listenersRef.current.filter((e) => e !== entry);
        };
    }, []);

    return {
        emit,
        send,
        on,
        connected,
        state,
        client: clientRef.current,
    };
}

/**
 * useGameState() — React Hook for automatic Delta-State-Management.
 *
 * Receives full state on the specified `stateEvent` and delta updates on `deltaEvent`,
 * keeping the local React state automatically synchronized via `patchImmutable`.
 *
 * @example
 * ```tsx
 * const { state, connected } = useGameState<GameState>(client, {
 *   stateEvent: "roomState",
 *   deltaEvent: "roomDelta",
 * });
 * ```
 */
export function useGameState<T extends object>(
    client: PPClient | null,
    options: {
        stateEvent?: string;
        deltaEvent?: string;
        initialState?: T;
        roomFilter?: string; // Optional: Only apply state/deltas for a specific room
    } = {}
): { state: T | null; connected: boolean; version: number } {
    const stateEvent = options.stateEvent ?? "roomState";
    const deltaEvent = options.deltaEvent ?? "roomDelta";
    
    const [state, setState] = useState<T | null>(options.initialState ?? null);
    const [version, setVersion] = useState(0);
    const [connected, setConnected] = useState(client?.connected ?? false);

    useEffect(() => {
        if (!client) {
            setConnected(false);
            return;
        }

        setConnected(client.connected);

        const onOpen = () => setConnected(true);
        const onClose = () => setConnected(false);

        const onState = (payload: any) => {
            if (options.roomFilter && payload?.room !== options.roomFilter) return;
            // Handle unwrapped vs typed room payloads
            const newState = payload?.state !== undefined ? payload.state : payload;
            setState(newState);
            setVersion(v => v + 1);
        };

        const onDelta = (payload: any) => {
            if (options.roomFilter && payload?.room !== options.roomFilter) return;
            const delta = payload?.delta !== undefined ? payload.delta : payload;
            
            setState(prev => {
                if (prev === null) {
                    console.warn(`[useGameState] Received delta before full state on ${deltaEvent}`);
                    return prev;
                }
                return patchImmutable(prev, delta);
            });
            setVersion(v => v + 1);
        };

        client.on("open", onOpen);
        client.on("close", onClose);
        client.on(stateEvent as any, onState);
        client.on(deltaEvent as any, onDelta);

        return () => {
            client.off("open", onOpen);
            client.off("close", onClose);
            client.off(stateEvent as any, onState);
            client.off(deltaEvent as any, onDelta);
        };
    }, [client, stateEvent, deltaEvent, options.roomFilter]);

    return { state, connected, version };
}

/**
 * usePresence() — Track online users via PaindaProtocol Presence.
 *
 * @example
 * ```tsx
 * const { presences, count } = usePresence(client);
 * // presences: Array<{ id: string, name: string, status: string, ... }>
 * ```
 */
export function usePresence<T = Record<string, unknown>>(
    client: PPClient | null,
    event = "presence"
): { presences: T[]; count: number } {
    const [presences, setPresences] = useState<T[]>([]);
    
    useEffect(() => {
        if (!client) return;

        const onPresence = (payload: any) => {
            const list = payload?.presences ?? payload ?? [];
            setPresences(Array.isArray(list) ? list : []);
        };

        client.on(event as any, onPresence);
        
        return () => {
            client.off(event as any, onPresence);
        };
    }, [client, event]);

    return { presences, count: presences.length };
}
