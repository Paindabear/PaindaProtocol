// Frame encoding/decoding
export {
  encodeFrame,
  decodeFrame,
  PP_MAGIC,
  PP_VERSION,
  PP_VERSION_1,
  PP_VERSION_2,
  HEADER_SIZE,
  HEADER_SIZE_V2,
} from "./frame.js";
export type { EncodeOptions } from "./frame.js";

// Server & Client
export { PPServer } from "./server.js";
export { PPClient } from "./client.js";
export type { PPClientAckCallback, PPClientSendOptions } from "./client.js";

// Schema
export { PPSchemaRegistry } from "./schema.js";
export type { PPSchema } from "./schema.js";

// Serializers
export {
  jsonSerializer,
  stringSerializer,
  bufferSerializer,
  structSerializer,
  mixedSerializer,
} from "./serializers.js";
export type { StructField } from "./serializers.js";

// Namespaces
export { PPNamespace, PPNamespacedSocket } from "./namespace.js";
export type { PPAckMessage, PPAckCallback, PPSendOptions } from "./namespace.js";

// Middleware
export { PPMiddlewarePipeline } from "./middleware.js";
export type { PPConnectionMiddleware, PPMessageMiddleware } from "./middleware.js";

// Transport
export { PollingTransport, PPTransportManager } from "./transport.js";
export type { PPTransport, PPTransportType, PPTransportEvents } from "./transport.js";

// Recovery
export { PPRecoveryManager } from "./recovery.js";
export type { RecoveryOptions } from "./recovery.js";

// Adapter
export { InMemoryAdapter } from "./adapter.js";
export type { PPAdapter } from "./adapter.js";

// Errors
export { PPError } from "./errors.js";
export type { PPErrorCode, PPErrorContext } from "./errors.js";

// Logger
export { createLogger, silentLogger } from "./logger.js";
export type { PPLogger, PPLogLevel, PPLogTransport, PPLoggerOptions } from "./logger.js";

// Plugin System
export { PPPluginManager } from "./plugin.js";
export type { PPPlugin, PPPluginContext, PPPluginHooks } from "./plugin.js";

// Typed Rooms
export { PPTypedRoom, PPRoomManager } from "./typed-room.js";
export type { TypedRoomOptions, PPDiffAlgorithm, PPRoomFullPolicy } from "./typed-room.js";

// Presence
export { PPPresence } from "./presence.js";
export type { PresenceData, PresenceEntry, PresenceOptions } from "./presence.js";

// Types
export type {
  PPMode,
  PPModeId,
  PPMessage,
  PPFrameHeader,
  PPDecodedFrame,
  PPServerOptions,
  PPClientOptions,
  PPServerEventMap,
  PPClientEventMap,
  PPClientSocket,
  PPClientSocketEventMap,
  PPTypedMessageHandler,
  PPCompressionConfig,
  PPHeartbeatConfig,
  PPRateLimitConfig,
  PPRateLimitStrategy,
  PPReconnectConfig,
  PPReconnectStrategy,
} from "./types.js";
