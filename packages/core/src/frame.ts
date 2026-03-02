import { MODE_MAP, MODE_REVERSE, type PPMode, type PPModeId, type PPMessage, type PPDecodedFrame } from "./types.js";
import type { PPSchemaRegistry } from "./schema.js";

/** Magic bytes: "PPND" (0x50 0x50 0x4E 0x44) */
export const PP_MAGIC = 0x50504e44;

/** Wire-format version 1 (Phase 0) */
export const PP_VERSION_1 = 1;

/** Wire-format version 2 (Phase 1: typed contracts) */
export const PP_VERSION_2 = 2;

/** Current wire-format version */
export const PP_VERSION = PP_VERSION_2;

/** V1 header: 12 bytes */
export const HEADER_SIZE = 12;

/** V2 header: 16 bytes (adds type ID + reserved) */
export const HEADER_SIZE_V2 = 16;

/** Flag bit: schema-based encoding is active */
const FLAG_SCHEMA = 0x08;

// Reusable instances for better performance
const sharedEncoder = new TextEncoder();
const sharedDecoder = new TextDecoder();

/**
 * Encode a PPMessage into a v2 binary frame.
 *
 * V2 Layout (big-endian, 16 bytes):
 *   Bytes 0-3:   Magic (0x50504E44)
 *   Bytes 4-5:   Version (uint16) = 2
 *   Bytes 6-7:   Flags (uint16): bits 0-1 mode, bit 2 compression, bit 3 schema
 *   Bytes 8-11:  Payload length (uint32)
 *   Bytes 12-13: Type ID (uint16) — schema registry ID, 0 = JSON fallback
 *   Bytes 14-15: Reserved (uint16)
 */
export function encodeFrame(mode: PPMode, message: PPMessage, registry?: PPSchemaRegistry): Uint8Array {
  const modeId: PPModeId = MODE_MAP[mode];
  let typeId = 0;
  let payload: Uint8Array;

  if (registry && registry.has(message.type)) {
    const encoded = registry.encode(message.type, message.payload);
    typeId = encoded.typeId;
    payload = encoded.payload;
  } else {
    const json = JSON.stringify(message);
    payload = sharedEncoder.encode(json);
  }

  let flags = modeId & 0x03;
  if (typeId !== 0) {
    flags |= FLAG_SCHEMA;
  }

  const buffer = new ArrayBuffer(HEADER_SIZE_V2 + payload.byteLength);
  const view = new DataView(buffer);

  view.setUint32(0, PP_MAGIC);
  view.setUint16(4, PP_VERSION);
  view.setUint16(6, flags);
  view.setUint32(8, payload.byteLength);
  view.setUint16(12, typeId);
  view.setUint16(14, 0); // reserved

  const frame = new Uint8Array(buffer);
  frame.set(payload, HEADER_SIZE_V2);

  return frame;
}

/**
 * Decode a binary frame (v1 or v2) back into header metadata and the original message.
 */
export function decodeFrame<T = unknown>(data: ArrayBuffer | Uint8Array, registry?: PPSchemaRegistry): PPDecodedFrame<T> {
  const buffer = data instanceof Uint8Array ? data.buffer : data;
  const byteOffset = data instanceof Uint8Array ? data.byteOffset : 0;
  const byteLength = data.byteLength;

  if (byteLength < HEADER_SIZE) {
    throw new Error(`PP frame too small: ${byteLength} bytes (minimum ${HEADER_SIZE})`);
  }

  // Use DataView straight on the buffer + offset (Zero-copy)
  const view = new DataView(buffer, byteOffset, byteLength);

  const magic = view.getUint32(0);
  if (magic !== PP_MAGIC) {
    throw new Error(`Invalid PP magic: 0x${magic.toString(16).toUpperCase()}, expected 0x${PP_MAGIC.toString(16).toUpperCase()}`);
  }

  const version = view.getUint16(4);
  const flags = view.getUint16(6);
  const payloadLength = view.getUint32(8);

  const modeId = (flags & 0x03) as PPModeId;
  const compressed = (flags & 0x04) !== 0;
  const hasSchema = (flags & FLAG_SCHEMA) !== 0;
  const mode = MODE_REVERSE[modeId];

  // V2 has 16-byte header with type ID
  const isV2 = version >= PP_VERSION_2;
  const headerSize = isV2 ? HEADER_SIZE_V2 : HEADER_SIZE;
  const typeId = isV2 && byteLength >= HEADER_SIZE_V2 ? view.getUint16(12) : 0;

  if (byteLength < headerSize + payloadLength) {
    throw new Error(`PP frame truncated: expected ${headerSize + payloadLength} bytes, got ${byteLength}`);
  }

  // Zero-copy representation of the payload bytes
  const payloadBytes = new Uint8Array(buffer, byteOffset + headerSize, payloadLength);

  let message: PPMessage<T>;

  if (hasSchema && typeId !== 0 && registry) {
    const decoded = registry.decode(typeId, payloadBytes);
    message = { type: decoded.type, payload: decoded.data as T };
  } else {
    const json = sharedDecoder.decode(payloadBytes);
    message = JSON.parse(json) as PPMessage<T>;
  }

  return {
    header: { version, mode, compressed, payloadLength },
    message,
  };
}
