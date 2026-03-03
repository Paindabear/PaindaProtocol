/**
 * @painda/client — PaindaProtocol Browser Client
 *
 * JSON ↔ Binary Bridge: Write JSON, wire uses PP binary frames.
 *
 * ## Quick Start
 *
 * ```ts
 * import { PPClient } from "@painda/client";
 *
 * const client = new PPClient({
 *   url: "wss://example.com/ws",
 *   reconnect: true,
 * });
 *
 * client.on("chat_message", (msg) => console.log(msg));
 * client.emit("chat", { text: "Hello!" });
 * ```
 *
 * ## React Hook
 *
 * ```tsx
 * import { usePP } from "@painda/client/react";
 *
 * function App() {
 *   const { emit, on, connected } = usePP({
 *     url: "wss://example.com/ws",
 *     reconnect: true,
 *   });
 *
 *   useEffect(() => {
 *     return on("chat_message", (msg) => {
 *       setChatMessages(prev => [...prev, msg]);
 *     });
 *   }, [on]);
 * }
 * ```
 */

// Core client
export { PPClient } from "./client.js";

// Frame utilities
export { encodeFrame, decodeFrame, decodeFrameAsync, isPPFrame, PP_MAGIC, PP_VERSION } from "./frame.js";

// Types
export type {
    PPMode,
    PPModeId,
    PPMessage,
    PPFrameHeader,
    PPDecodedFrame,
    PPReconnectConfig,
    PPReconnectStrategy,
    PPClientOptions,
    PPConnectionState,
} from "./types.js";

export { MODE_MAP, MODE_REVERSE } from "./types.js";
