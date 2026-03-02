/**
 * Pluggable Logger for PaindaProtocol.
 * 
 * Usage:
 *   import { createLogger } from "@painda/core";
 * 
 *   // Default console logger
 *   const logger = createLogger({ level: "info" });
 * 
 *   // Custom transport (Pino, Winston, etc.)
 *   const logger = createLogger({
 *     level: "debug",
 *     transport: (level, ...args) => pino[level](...args),
 *   });
 * 
 *   // Silent (no output)
 *   const logger = createLogger({ level: "silent" });
 */

export type PPLogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type PPLogTransport = (level: Exclude<PPLogLevel, "silent">, ...args: unknown[]) => void;

export interface PPLoggerOptions {
    /** Minimum log level. Default: "info" */
    level?: PPLogLevel;
    /** Custom transport. Default: console */
    transport?: PPLogTransport;
    /** Prefix for all log messages. Default: "[PP]" */
    prefix?: string;
}

const LOG_LEVELS: Record<PPLogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4,
};

export interface PPLogger {
    debug(...args: unknown[]): void;
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    child(prefix: string): PPLogger;
}

export function createLogger(options?: PPLoggerOptions): PPLogger {
    const level = options?.level ?? "info";
    const threshold = LOG_LEVELS[level];
    const prefix = options?.prefix ?? "[PP]";
    const transport = options?.transport;

    function log(logLevel: Exclude<PPLogLevel, "silent">, ...args: unknown[]): void {
        if (LOG_LEVELS[logLevel] < threshold) return;

        if (transport) {
            transport(logLevel, prefix, ...args);
        } else {
            const fn = logLevel === "debug" ? console.debug
                : logLevel === "info" ? console.log
                    : logLevel === "warn" ? console.warn
                        : console.error;
            fn(prefix, ...args);
        }
    }

    return {
        debug: (...args) => log("debug", ...args),
        info: (...args) => log("info", ...args),
        warn: (...args) => log("warn", ...args),
        error: (...args) => log("error", ...args),
        child: (childPrefix: string) => createLogger({
            ...options,
            prefix: `${prefix}[${childPrefix}]`,
        }),
    };
}

/** No-op logger — completely silent, zero overhead. */
export const silentLogger: PPLogger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
    child: () => silentLogger,
};
