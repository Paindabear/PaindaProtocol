/**
 * @painda/redis — Redis Adapter for PaindaProtocol horizontal scaling.
 *
 * Uses a custom binary wire format for inter-node pub/sub:
 * - Without schema registry: compact binary (type as string, payload as JSON bytes)
 * - With schema registry: 2-byte type ID + binary-encoded payload (minimal overhead)
 *
 * This is significantly faster than Socket.io's Redis adapter which uses JSON.stringify.
 *
 * Usage:
 * ```ts
 * import { PPServer } from "@painda/core";
 * import { RedisAdapter } from "@painda/redis";
 *
 * const server = new PPServer({
 *   port: 3000,
 *   adapter: new RedisAdapter({ host: "localhost", port: 6379 }),
 * });
 * ```
 *
 * With schema registry (maximum compression):
 * ```ts
 * const registry = new PPSchemaRegistry();
 * const server = new PPServer({ port: 3000, registry, adapter: new RedisAdapter({ registry }) });
 * ```
 */

import Redis from "ioredis";
import type { PPAdapter, PPMessage } from "@painda/core";
import type { PPSchemaRegistry } from "@painda/core";

export interface RedisAdapterOptions {
  /** Redis host. Default: "localhost" */
  host?: string;
  /** Redis port. Default: 6379 */
  port?: number;
  /** Redis password. */
  password?: string;
  /** Redis database index. Default: 0 */
  db?: number;
  /** Key prefix for all Redis keys. Default: "pp:" */
  keyPrefix?: string;
  /**
   * Optional schema registry for binary-encoding message type IDs.
   * When provided, registered event types are encoded as 2-byte IDs instead of strings.
   * Must match the registry used on the PPServer instance.
   */
  registry?: PPSchemaRegistry;
  /** Called on Redis connection errors. */
  onError?: (err: Error) => void;
}

// ---- Binary Wire Format ----
//
// Redis pub/sub payload (big-endian):
//   [1]  excludeLen: uint8   — byte length of excludeClientId (0 = no exclude)
//   [N]  excludeId: utf8     — the excludeClientId bytes
//   [2]  typeId: uint16      — 0 = string type, >0 = schema registry type ID
//   IF typeId == 0:
//     [2]  typeLen: uint16   — byte length of event type string
//     [M]  type: utf8        — the event name
//   ELSE: (type is inferred from registry by typeId)
//   [rest] payload: bytes    — JSON bytes (typeId=0) or schema-binary (typeId>0)

function encodeRedisPayload(
  message: PPMessage,
  excludeClientId: string | undefined,
  registry?: PPSchemaRegistry,
): Buffer {
  const excludeBytes = excludeClientId
    ? Buffer.from(excludeClientId, "utf8")
    : Buffer.alloc(0);

  const parts: Buffer[] = [];

  // excludeLen (uint8) + excludeId
  parts.push(Buffer.from([excludeBytes.byteLength]));
  if (excludeBytes.byteLength > 0) parts.push(excludeBytes);

  // Try schema encoding
  const schemaEntry = registry?.has(message.type)
    ? registry.encode(message.type, message.payload)
    : null;

  if (schemaEntry) {
    // typeId as uint16 (big-endian)
    const typeBuf = Buffer.alloc(2);
    typeBuf.writeUInt16BE(schemaEntry.typeId, 0);
    parts.push(typeBuf);
    parts.push(Buffer.from(schemaEntry.payload));
  } else {
    // typeId = 0 (uint16) + typeLen (uint16) + type utf8 + JSON payload
    const typeBuf = Buffer.from(message.type, "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt16BE(0, 0);           // typeId = 0
    header.writeUInt16BE(typeBuf.byteLength, 2);
    parts.push(header, typeBuf);
    parts.push(Buffer.from(JSON.stringify(message.payload), "utf8"));
  }

  return Buffer.concat(parts);
}

function decodeRedisPayload(
  buf: Buffer,
  registry?: PPSchemaRegistry,
): { message: PPMessage; excludeClientId: string | undefined } {
  let offset = 0;

  const excludeLen = buf.readUInt8(offset++);
  const excludeClientId = excludeLen > 0
    ? buf.subarray(offset, offset + excludeLen).toString("utf8")
    : undefined;
  offset += excludeLen;

  const typeId = buf.readUInt16BE(offset);
  offset += 2;

  let message: PPMessage;

  if (typeId === 0) {
    // String type
    const typeLen = buf.readUInt16BE(offset);
    offset += 2;
    const type = buf.subarray(offset, offset + typeLen).toString("utf8");
    offset += typeLen;
    const payload = JSON.parse(buf.subarray(offset).toString("utf8"));
    message = { type, payload };
  } else if (registry) {
    // Schema-encoded
    const payloadBytes = new Uint8Array(buf.buffer, buf.byteOffset + offset, buf.byteLength - offset);
    const decoded = registry.decode(typeId, payloadBytes);
    message = { type: decoded.type, payload: decoded.data };
  } else {
    throw new Error(`RedisAdapter: received schema-encoded message (typeId=${typeId}) but no registry provided`);
  }

  return { message, excludeClientId };
}

// ---- RedisAdapter ----

export class RedisAdapter implements PPAdapter {
  private readonly pubClient: Redis;
  private readonly subClient: Redis;
  private readonly keyPrefix: string;
  private readonly registry?: PPSchemaRegistry;
  private readonly callbacks = new Map<string, (message: PPMessage, excludeClientId?: string) => void>();

  constructor(options: RedisAdapterOptions = {}) {
    const redisOpts = {
      host: options.host ?? "localhost",
      port: options.port ?? 6379,
      password: options.password,
      db: options.db ?? 0,
      lazyConnect: true,
    };

    this.keyPrefix = options.keyPrefix ?? "pp:";
    this.registry = options.registry;

    this.pubClient = new Redis(redisOpts);
    this.subClient = new Redis({ ...redisOpts, enableReadyCheck: false });

    if (options.onError) {
      this.pubClient.on("error", options.onError);
      this.subClient.on("error", options.onError);
    }

    // subClient in buffer mode so we receive Buffers for binary payloads
    this.subClient.on("messageBuffer", (channelBuf: Buffer, dataBuf: Buffer) => {
      const channel = channelBuf.toString("utf8");
      const stripped = channel.startsWith(this.keyPrefix + "ch:")
        ? channel.slice((this.keyPrefix + "ch:").length)
        : channel;

      const cb = this.callbacks.get(stripped);
      if (!cb) return;

      try {
        const { message, excludeClientId } = decodeRedisPayload(dataBuf, this.registry);
        cb(message, excludeClientId);
      } catch (err) {
        console.error("[RedisAdapter] Failed to decode message:", err);
      }
    });
  }

  async publish(channel: string, message: PPMessage, excludeClientId?: string): Promise<void> {
    const buf = encodeRedisPayload(message, excludeClientId, this.registry);
    // ioredis accepts Buffer args for binary-safe pub/sub
    await (this.pubClient as any).publish(`${this.keyPrefix}ch:${channel}`, buf);
  }

  async subscribe(channel: string, callback: (message: PPMessage, excludeClientId?: string) => void): Promise<void> {
    this.callbacks.set(channel, callback);
    await this.subClient.subscribe(`${this.keyPrefix}ch:${channel}`);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.callbacks.delete(channel);
    await this.subClient.unsubscribe(`${this.keyPrefix}ch:${channel}`);
  }

  async addToRoom(room: string, clientId: string): Promise<void> {
    await Promise.all([
      this.pubClient.sadd(`${this.keyPrefix}room:${room}`, clientId),
      this.pubClient.sadd(`${this.keyPrefix}client:${clientId}:rooms`, room),
    ]);
  }

  async removeFromRoom(room: string, clientId: string): Promise<void> {
    await Promise.all([
      this.pubClient.srem(`${this.keyPrefix}room:${room}`, clientId),
      this.pubClient.srem(`${this.keyPrefix}client:${clientId}:rooms`, room),
    ]);
  }

  async getClientsInRoom(room: string): Promise<Set<string>> {
    const members = await this.pubClient.smembers(`${this.keyPrefix}room:${room}`);
    return new Set(members);
  }

  async getClientRooms(clientId: string): Promise<Set<string>> {
    const rooms = await this.pubClient.smembers(`${this.keyPrefix}client:${clientId}:rooms`);
    return new Set(rooms);
  }

  async close(): Promise<void> {
    this.callbacks.clear();
    await Promise.all([this.pubClient.quit(), this.subClient.quit()]);
  }
}
