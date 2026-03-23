/**
 * ppMetricsPlugin — opt-in metrics collection for PaindaProtocol.
 *
 * Tracks: connections, disconnections, messages, errors, room events, bytes.
 * Exposes a Prometheus-compatible `/metrics` text output via `getPrometheusText()`.
 *
 * Usage:
 * ```ts
 * import { PPServer, ppMetricsPlugin } from "@painda/core";
 *
 * const server = new PPServer({ port: 3000 });
 * server.register(ppMetricsPlugin);
 *
 * // Access metrics from any plugin or external handler:
 * const metrics = server.getPlugin<PPMetricsAPI>("pp-metrics");
 * console.log(metrics.getMetrics());
 * console.log(metrics.getPrometheusText());
 *
 * // Optional: HTTP endpoint for Prometheus scraping
 * http.createServer((req, res) => {
 *   if (req.url === "/metrics") {
 *     res.setHeader("Content-Type", "text/plain; version=0.0.4");
 *     res.end(metrics.getPrometheusText());
 *   }
 * }).listen(9090);
 * ```
 */

import type { PPPlugin, PPPluginContext } from "./plugin.js";
import type { PPClientSocket, PPMessage } from "./types.js";

// ---- Snapshot types ----

export interface PPMetricsSnapshot {
  /** Total connections since server start (or last reset). */
  connectionsTotal: number;
  /** Total disconnections. */
  disconnectionsTotal: number;
  /** Currently connected clients. */
  connectionsActive: number;
  /** Total messages received from clients. */
  messagesReceived: number;
  /** Total messages sent to clients. */
  messagesSent: number;
  /** Total bytes received (estimated: payload JSON length). */
  bytesReceived: number;
  /** Total bytes sent (estimated). */
  bytesSent: number;
  /** Total room join events. */
  roomJoinsTotal: number;
  /** Total room leave events. */
  roomLeavesTotal: number;
  /** Total errors dispatched via onError. */
  errorsTotal: number;
  /** Unix timestamp (ms) when metrics were last reset. */
  resetAt: number;
  /** Message count per type — top senders. */
  messagesByType: Record<string, number>;
}

export interface PPMetricsOptions {
  /**
   * Whether to track per-type message counts. Default: true.
   * Disable if you have many unique event types to avoid memory growth.
   */
  trackMessageTypes?: boolean;

  /**
   * Custom on-metric callback — called after every increment.
   * Use this to push to StatsD, DataDog, etc.
   * @example
   * onMetric: (name, value, labels) => statsd.increment(name, value, labels)
   */
  onMetric?: (name: string, value: number, labels?: Record<string, string>) => void;
}

export interface PPMetricsAPI {
  /** Get a snapshot of all current metrics. */
  getMetrics(): PPMetricsSnapshot;
  /** Reset all counters. Active connections count is preserved. */
  resetMetrics(): void;
  /**
   * Get a Prometheus-compatible text format (exposition format 0.0.4).
   * Suitable for direct scraping by a Prometheus server.
   */
  getPrometheusText(): string;
}

// ---- Plugin implementation ----

export const ppMetricsPlugin: PPPlugin<PPMetricsOptions> = {
  name: "pp-metrics",
  version: "1.0.0",

  install(ctx: PPPluginContext, options: PPMetricsOptions = {}): ReturnType<PPPlugin["install"]> {
    const trackTypes = options.trackMessageTypes !== false;
    const onMetric = options.onMetric;

    const m: PPMetricsSnapshot = {
      connectionsTotal: 0,
      disconnectionsTotal: 0,
      connectionsActive: 0,
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      roomJoinsTotal: 0,
      roomLeavesTotal: 0,
      errorsTotal: 0,
      resetAt: Date.now(),
      messagesByType: {},
    };

    function inc(name: keyof Omit<PPMetricsSnapshot, "resetAt" | "messagesByType">, by = 1, labels?: Record<string, string>): void {
      (m[name] as number) += by;
      onMetric?.(`pp_${name}`, by, labels);
    }

    const api: PPMetricsAPI = {
      getMetrics(): PPMetricsSnapshot {
        return { ...m, messagesByType: { ...m.messagesByType } };
      },

      resetMetrics(): void {
        const active = m.connectionsActive;
        Object.assign(m, {
          connectionsTotal: 0,
          disconnectionsTotal: 0,
          connectionsActive: active, // preserve live count
          messagesReceived: 0,
          messagesSent: 0,
          bytesReceived: 0,
          bytesSent: 0,
          roomJoinsTotal: 0,
          roomLeavesTotal: 0,
          errorsTotal: 0,
          resetAt: Date.now(),
          messagesByType: {},
        });
      },

      getPrometheusText(): string {
        const lines: string[] = [
          `# HELP pp_connections_total Total WebSocket connections accepted`,
          `# TYPE pp_connections_total counter`,
          `pp_connections_total ${m.connectionsTotal}`,
          `# HELP pp_connections_active Currently connected clients`,
          `# TYPE pp_connections_active gauge`,
          `pp_connections_active ${m.connectionsActive}`,
          `# HELP pp_disconnections_total Total disconnections`,
          `# TYPE pp_disconnections_total counter`,
          `pp_disconnections_total ${m.disconnectionsTotal}`,
          `# HELP pp_messages_received_total Total messages received`,
          `# TYPE pp_messages_received_total counter`,
          `pp_messages_received_total ${m.messagesReceived}`,
          `# HELP pp_messages_sent_total Total messages sent`,
          `# TYPE pp_messages_sent_total counter`,
          `pp_messages_sent_total ${m.messagesSent}`,
          `# HELP pp_bytes_received_total Estimated bytes received`,
          `# TYPE pp_bytes_received_total counter`,
          `pp_bytes_received_total ${m.bytesReceived}`,
          `# HELP pp_bytes_sent_total Estimated bytes sent`,
          `# TYPE pp_bytes_sent_total counter`,
          `pp_bytes_sent_total ${m.bytesSent}`,
          `# HELP pp_room_joins_total Total room join events`,
          `# TYPE pp_room_joins_total counter`,
          `pp_room_joins_total ${m.roomJoinsTotal}`,
          `# HELP pp_room_leaves_total Total room leave events`,
          `# TYPE pp_room_leaves_total counter`,
          `pp_room_leaves_total ${m.roomLeavesTotal}`,
          `# HELP pp_errors_total Total server errors`,
          `# TYPE pp_errors_total counter`,
          `pp_errors_total ${m.errorsTotal}`,
        ];

        if (trackTypes && Object.keys(m.messagesByType).length > 0) {
          lines.push(
            `# HELP pp_message_type_total Messages received per type`,
            `# TYPE pp_message_type_total counter`,
          );
          for (const [type, count] of Object.entries(m.messagesByType)) {
            lines.push(`pp_message_type_total{type="${type}"} ${count}`);
          }
        }

        return lines.join("\n") + "\n";
      },
    };

    ctx.expose(api as unknown as Record<string, unknown>);

    return {
      onConnect(_socket: PPClientSocket): void {
        inc("connectionsTotal");
        inc("connectionsActive");
      },

      onDisconnect(_socket: PPClientSocket): void {
        inc("disconnectionsTotal");
        m.connectionsActive = Math.max(0, m.connectionsActive - 1);
        onMetric?.("pp_connectionsActive", m.connectionsActive);
      },

      onMessage(_socket: PPClientSocket, message: PPMessage): void {
        inc("messagesReceived");
        const byteEst = JSON.stringify(message.payload).length;
        inc("bytesReceived", byteEst);
        if (trackTypes && message.type && !message.type.startsWith("__pp_")) {
          m.messagesByType[message.type] = (m.messagesByType[message.type] ?? 0) + 1;
          onMetric?.("pp_message_type_total", 1, { type: message.type });
        }
      },

      onSend(_socket: PPClientSocket, message: PPMessage): PPMessage {
        inc("messagesSent");
        const byteEst = JSON.stringify(message.payload).length;
        inc("bytesSent", byteEst);
        return message;
      },

      onRoomJoin(_socket: PPClientSocket, _room: string): void {
        inc("roomJoinsTotal");
      },

      onRoomLeave(_socket: PPClientSocket, _room: string): void {
        inc("roomLeavesTotal");
      },

      onError(_error: Error): void {
        inc("errorsTotal");
      },
    };
  },
};
