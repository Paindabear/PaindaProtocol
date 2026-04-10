// --------------------------------------------------------------------------
// This is the main entry point for NODE.JS environments.
// It includes server-side logic and may pull in Node-specific dependencies.
// For BROWSERS, use "@painda/core/frame" or "@painda/core/schema" etc.
// --------------------------------------------------------------------------

// Re-export common logic
export * from "./common/frame.js";
export * from "./common/schema.js";
export * from "./common/serializers.js";
export * from "./common/namespace.js";
export * from "./common/middleware.js";
export * from "./common/transport.js";
export * from "./common/recovery.js";
export * from "./common/adapter.js";
export * from "./common/errors.js";
export * from "./common/logger.js";
export * from "./common/plugin.js";
export { ppMetricsPlugin } from "./common/metrics-plugin.js";
export type { PPMetricsSnapshot, PPMetricsAPI, PPMetricsOptions } from "./common/metrics-plugin.js";
export * from "./common/typed-room.js";
export * from "./common/diff.js";
export * from "./common/presence.js";
export * from "./common/types.js";
export * from "./common/virtual-client.js";

// Node-only: PPServer
export { PPServer } from "./server.js";

// Node-only: Telemetry (disabled for now)
// export { sendTelemetryPing } from "./node/telemetry.js";

