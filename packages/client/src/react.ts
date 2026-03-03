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
