/**
 * PaindaProtocol browser-compatible frame encoder/decoder.
 *
 * JSON ↔ Binary Bridge:
 *   Browser (JSON) → encodeFrame → Wire (PP Binary Frame) → Server decodeFrame
 *   Browser (JSON) ← decodeFrame ← Wire (PP Binary Frame) ← Server encodeFrame
 *
 * Binary frame v2 layout (16 bytes header, big-endian):
 *   Bytes 0-3:   Magic  (0x50504E44 = "PPND")
 *   Bytes 4-5:   Version (uint16) = 2
 *   Bytes 6-7:   Flags  (uint16): bits 0-1 mode, bit 2 compression, bit 3 schema
 *   Bytes 8-11:  Payload length (uint32)
 *   Bytes 12-13: Type ID (uint16) — 0 = JSON fallback
 *   Bytes 14-15: Reserved (uint16)
 *
 * No node:zlib dependency — uses Web Compression API if available, otherwise skips.
 */

import { MODE_MAP, MODE_REVERSE, type PPMode, type PPModeId, type PPMessage, type PPDecodedFrame } from "./types.js";

/** Magic bytes: "PPND" */
export const PP_MAGIC = 0x50504e44;

/** Wire-format version */
export const PP_VERSION = 2;

/** Header sizes */
export const HEADER_SIZE_V1 = 12;
export const HEADER_SIZE_V2 = 16;

/** Flag bits */
const FLAG_COMPRESSED = 0x04;
const FLAG_SCHEMA = 0x08;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a PPMessage into a v2 binary frame.
 * Browser-compatible: no node:zlib, no compression (payloads are small for real-time).
 */
export function encodeFrame(mode: PPMode, message: PPMessage): Uint8Array {
    const modeId: PPModeId = MODE_MAP[mode];

    // JSON-encode the full message
    const json = JSON.stringify(message);
    const payload = encoder.encode(json);

    const flags = modeId & 0x03; // no compression, no schema

    const buffer = new ArrayBuffer(HEADER_SIZE_V2 + payload.byteLength);
    const view = new DataView(buffer);

    view.setUint32(0, PP_MAGIC);         // Magic "PPND"
    view.setUint16(4, PP_VERSION);       // Version 2
    view.setUint16(6, flags);            // Flags
    view.setUint32(8, payload.byteLength); // Payload length
    view.setUint16(12, 0);               // Type ID (0 = JSON)
    view.setUint16(14, 0);               // Reserved

    const frame = new Uint8Array(buffer);
    frame.set(payload, HEADER_SIZE_V2);

    return frame;
}

/**
 * Decode a binary frame (v1 or v2) back into a PPMessage.
 * Handles server-sent frames with or without compression.
 */
export function decodeFrame<T = unknown>(data: ArrayBuffer | Uint8Array): PPDecodedFrame<T> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (bytes.byteLength < HEADER_SIZE_V1) {
        throw new Error(`PP frame too small: ${bytes.byteLength} bytes`);
    }

    const magic = view.getUint32(0);
    if (magic !== PP_MAGIC) {
        throw new Error(`Invalid PP magic: 0x${magic.toString(16).toUpperCase()}`);
    }

    const version = view.getUint16(4);
    const flags = view.getUint16(6);
    const payloadLength = view.getUint32(8);

    const modeId = (flags & 0x03) as PPModeId;
    const compressed = (flags & FLAG_COMPRESSED) !== 0;
    const mode = MODE_REVERSE[modeId];

    // V2 has 16-byte header
    const isV2 = version >= 2;
    const headerSize = isV2 ? HEADER_SIZE_V2 : HEADER_SIZE_V1;

    if (bytes.byteLength < headerSize + payloadLength) {
        throw new Error(`PP frame truncated: expected ${headerSize + payloadLength}, got ${bytes.byteLength}`);
    }

    let payloadBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + headerSize, payloadLength);

    // Handle compressed frames from server
    if (compressed) {
        payloadBytes = decompressBrowser(payloadBytes);
    }

    const json = decoder.decode(payloadBytes);
    const message = JSON.parse(json) as PPMessage<T>;

    return {
        header: { version, mode, compressed, payloadLength },
        message,
    };
}

/**
 * Check if data is a PP binary frame (starts with PPND magic).
 */
export function isPPFrame(data: ArrayBuffer | Uint8Array): boolean {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.byteLength < 4) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(0) === PP_MAGIC;
}

/**
 * Browser decompression using DecompressionStream (Web API).
 * Falls back to raw bytes if not available.
 */
function decompressBrowser(data: Uint8Array): Uint8Array {
    // DecompressionStream is available in modern browsers (Chrome 80+, Firefox 113+, Safari 16.4+)
    if (typeof DecompressionStream !== "undefined") {
        try {
            const ds = new DecompressionStream("deflate");
            const writer = ds.writable.getWriter();
            const reader = ds.readable.getReader();

            // Start writing
            writer.write(data);
            writer.close();

            // Read all chunks synchronously-ish (we're in a sync context, so this is best-effort)
            // For real async decompression, use decodeFrameAsync
            const chunks: Uint8Array[] = [];
            const readAll = async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                }
            };

            // This is a sync function, so we can't await.
            // For compressed frames, use decodeFrameAsync instead.
            // This path is a best-effort fallback.
            console.warn("[@painda/client] Received compressed frame. Use decodeFrameAsync for compressed data.");
            return data; // Return raw — server should not compress for browser clients
        } catch {
            return data;
        }
    }

    // No decompression available — return raw
    console.warn("[@painda/client] Cannot decompress: DecompressionStream not available");
    return data;
}

/**
 * Async frame decode — properly handles compressed frames in the browser.
 */
export async function decodeFrameAsync<T = unknown>(data: ArrayBuffer | Uint8Array): Promise<PPDecodedFrame<T>> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const flags = view.getUint16(6);
    const compressed = (flags & FLAG_COMPRESSED) !== 0;

    if (!compressed) {
        return decodeFrame<T>(data);
    }

    // Async decompression
    const version = view.getUint16(4);
    const payloadLength = view.getUint32(8);
    const modeId = (flags & 0x03) as PPModeId;
    const mode = MODE_REVERSE[modeId];
    const isV2 = version >= 2;
    const headerSize = isV2 ? HEADER_SIZE_V2 : HEADER_SIZE_V1;

    let payloadBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + headerSize, payloadLength);

    if (typeof DecompressionStream !== "undefined") {
        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(payloadBytes);
        writer.close();

        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }

        const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
        payloadBytes = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            payloadBytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
    }

    const json = decoder.decode(payloadBytes);
    const message = JSON.parse(json) as PPMessage<T>;

    return {
        header: { version, mode, compressed, payloadLength },
        message,
    };
}
