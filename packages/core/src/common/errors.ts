/**
 * #10: Rich error types with context for better debugging.
 */

export type PPErrorCode =
    | "DECODE_ERROR"
    | "ENCODE_ERROR"
    | "AUTH_ERROR"
    | "MIDDLEWARE_ERROR"
    | "NAMESPACE_ERROR"
    | "TRANSPORT_ERROR"
    | "ADAPTER_ERROR"
    | "TIMEOUT_ERROR"
    | "RATE_LIMIT_ERROR"
    | "CONNECTION_ERROR";

export interface PPErrorContext {
    /** Client ID that triggered the error */
    clientId?: string;
    /** Namespace where the error occurred */
    namespace?: string;
    /** Message type being processed */
    messageType?: string;
    /** Ack ID if applicable */
    ackId?: number;
    /** Additional metadata */
    meta?: Record<string, unknown>;
}

export class PPError extends Error {
    readonly code: PPErrorCode;
    readonly context: PPErrorContext;
    readonly timestamp: number;

    constructor(code: PPErrorCode, message: string, context: PPErrorContext = {}) {
        super(`[${code}] ${message}`);
        this.name = "PPError";
        this.code = code;
        this.context = context;
        this.timestamp = Date.now();
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            timestamp: this.timestamp,
        };
    }
}
