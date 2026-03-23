/**
 * @painda/admin — Lightweight admin dashboard for PaindaProtocol.
 *
 * Spawns a plain Node.js HTTP server with a self-contained monitoring UI.
 * No external runtime dependencies — only node:http and node:buffer.
 *
 * Endpoints:
 *   GET /          — HTML dashboard (auto-refreshes every 2s)
 *   GET /api/stats — JSON: server stats + optional metrics snapshot
 *   GET /api/clients — JSON: connected sockets (id, rooms, tags)
 *   GET /metrics   — Prometheus exposition format (requires ppMetricsPlugin)
 *
 * Usage:
 * ```ts
 * import { PPServer, ppMetricsPlugin } from "@painda/core";
 * import { PPAdminServer } from "@painda/admin";
 *
 * const server = new PPServer({ port: 3000 });
 * server.register(ppMetricsPlugin);
 *
 * const admin = new PPAdminServer(server, {
 *   port: 9090,
 *   auth: { username: "admin", password: "secret" },
 * });
 * admin.start();
 * // Dashboard: http://localhost:9090
 * // Prometheus: http://localhost:9090/metrics
 * ```
 */

import http from "node:http";
import { dashboardHtml } from "./dashboard.js";
import type { PPServer, PPMetricsAPI } from "@painda/core";

export interface PPAdminOptions {
  /** HTTP port for the admin server. Default: 9090 */
  port?: number;
  /** HTTP host to bind to. Default: "localhost" */
  host?: string;
  /** Optional Basic Auth credentials. If omitted, no auth is required. */
  auth?: {
    username: string;
    password: string;
  };
}

export class PPAdminServer {
  readonly httpServer: http.Server;
  private readonly options: Required<Omit<PPAdminOptions, "auth">> & { auth?: PPAdminOptions["auth"] };

  constructor(
    private readonly server: PPServer,
    options: PPAdminOptions = {},
  ) {
    this.options = {
      port: options.port ?? 9090,
      host: options.host ?? "localhost",
      auth: options.auth,
    };

    this.httpServer = http.createServer((req, res) => {
      // Basic Auth check
      if (this.options.auth) {
        const header = req.headers["authorization"] ?? "";
        if (!header.startsWith("Basic ")) {
          res.writeHead(401, { "WWW-Authenticate": 'Basic realm="PP Admin"' });
          res.end("Unauthorized");
          return;
        }
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
        const colonIdx = decoded.indexOf(":");
        const user = colonIdx >= 0 ? decoded.slice(0, colonIdx) : decoded;
        const pass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : "";
        if (user !== this.options.auth.username || pass !== this.options.auth.password) {
          res.writeHead(401, { "WWW-Authenticate": 'Basic realm="PP Admin"' });
          res.end("Unauthorized");
          return;
        }
      }

      const url = req.url?.split("?")[0] ?? "/";

      if (req.method === "GET" && url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(dashboardHtml);
        return;
      }

      if (req.method === "GET" && url === "/api/stats") {
        const stats = this.server.getStats();
        const metricsPlugin = this.server.getPlugin<PPMetricsAPI>("pp-metrics");
        const metrics = metricsPlugin?.getMetrics() ?? null;
        const plugins = this.server.getPluginNames();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...stats, plugins, metrics }));
        return;
      }

      if (req.method === "GET" && url === "/api/clients") {
        const clients = this.server.getClients().map((c) => ({
          id: c.id,
          rooms: [...c.rooms],
          tags: Object.fromEntries(c.getAllTags()),
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(clients));
        return;
      }

      if (req.method === "GET" && url === "/metrics") {
        const metricsPlugin = this.server.getPlugin<PPMetricsAPI>("pp-metrics");
        if (!metricsPlugin) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("# No metrics plugin registered. Add: server.register(ppMetricsPlugin)\n");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
        res.end(metricsPlugin.getPrometheusText());
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });
  }

  /** Start the admin HTTP server. */
  start(): void {
    this.httpServer.listen(this.options.port, this.options.host, () => {
      console.log(`[PP Admin] Dashboard: http://${this.options.host}:${this.options.port}`);
      console.log(`[PP Admin] Metrics:   http://${this.options.host}:${this.options.port}/metrics`);
    });

    this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.error(`[PP Admin] Port ${this.options.port} is already in use.`);
      } else {
        console.error("[PP Admin] HTTP server error:", err.message);
      }
    });
  }

  /** Gracefully stop the admin HTTP server. */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
