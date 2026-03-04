/**
 * PaindaProtocol Anonymous Telemetry ("Nach-Hause-Telefonieren")
 *
 * Sends a tiny, anonymous ping when PPServer starts.
 * Opt-out: set PAINDA_TELEMETRY_DISABLED=1
 *
 * Data collected (non-PII):
 *   - projectId: random ID stored in .painda-telemetry
 *   - ppVersion: @painda/core version from package.json
 *   - os: process.platform
 *   - nodeVersion: process.version
 *
 * All errors are silently swallowed — telemetry must never break production.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const TELEMETRY_FILE = ".painda-telemetry";
const TELEMETRY_ENDPOINT = "https://admin.painda.tools/api/telemetry";
const PP_VERSION = "0.1.4";

/**
 * Get or create a persistent, anonymous project ID.
 * Stored in `.painda-telemetry` in the current working directory.
 */
function getOrCreateProjectId(): string | null {
    try {
        const filePath = join(process.cwd(), TELEMETRY_FILE);

        if (existsSync(filePath)) {
            const content = readFileSync(filePath, "utf-8").trim();
            if (content && content.startsWith("pp_")) return content;
        }

        // Generate: pp_{timestamp}_{random6}
        const ts = Math.floor(Date.now() / 1000);
        const rand = randomBytes(3).toString("hex"); // 6 hex chars
        const projectId = `pp_${ts}_${rand}`;

        writeFileSync(filePath, projectId, "utf-8");
        return projectId;
    } catch {
        // Can't read/write file — skip silently
        return null;
    }
}

/**
 * Send an anonymous telemetry ping. Fire-and-forget.
 * Returns immediately, never throws, never blocks.
 */
export function sendTelemetryPing(): void {
    // Opt-out check
    if (
        process.env.PAINDA_TELEMETRY_DISABLED === "1" ||
        process.env.PAINDA_TELEMETRY_DISABLED === "true" ||
        process.env.DO_NOT_TRACK === "1"
    ) {
        return;
    }

    // Run in microtask to never block the constructor
    Promise.resolve().then(async () => {
        try {
            const projectId = getOrCreateProjectId();
            if (!projectId) return;

            const payload = JSON.stringify({
                projectId,
                ppVersion: PP_VERSION,
                os: process.platform,
                nodeVersion: process.version,
            });

            // Use native fetch (Node 18+) — no external deps
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

            await fetch(TELEMETRY_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                signal: controller.signal,
            });

            clearTimeout(timeout);
        } catch {
            // Silent fail — telemetry must never disrupt production
        }
    });
}
