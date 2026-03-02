export interface PPSchema<T = unknown> {
  id: number;
  encode: (data: T) => Uint8Array;
  decode: (buf: Uint8Array) => T;
}

const JSON_FALLBACK_ID = 0;

export class PPSchemaRegistry {
  private byType = new Map<string, PPSchema>();
  private byId = new Map<number, { type: string; schema: PPSchema }>();
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  register<T>(type: string, schema: PPSchema<T>): void {
    if (schema.id === JSON_FALLBACK_ID) {
      throw new Error(`Schema ID 0 is reserved for the JSON fallback`);
    }
    if (this.byType.has(type)) {
      throw new Error(`Schema already registered for type "${type}"`);
    }
    if (this.byId.has(schema.id)) {
      throw new Error(`Schema ID ${schema.id} is already in use`);
    }
    this.byType.set(type, schema as PPSchema);
    this.byId.set(schema.id, { type, schema: schema as PPSchema });
  }

  has(type: string): boolean {
    return this.byType.has(type);
  }

  encode(type: string, data: unknown): { typeId: number; payload: Uint8Array } {
    const schema = this.byType.get(type);
    if (schema) {
      return { typeId: schema.id, payload: schema.encode(data) };
    }
    const json = JSON.stringify({ type, payload: data });
    return { typeId: JSON_FALLBACK_ID, payload: this.encoder.encode(json) };
  }

  decode(typeId: number, buf: Uint8Array): { type: string; data: unknown } {
    if (typeId === JSON_FALLBACK_ID) {
      const json = this.decoder.decode(buf);
      const parsed = JSON.parse(json) as { type: string; payload: unknown };
      return { type: parsed.type, data: parsed.payload };
    }
    const entry = this.byId.get(typeId);
    if (!entry) {
      throw new Error(`No schema registered for type ID ${typeId}`);
    }
    return { type: entry.type, data: entry.schema.decode(buf) };
  }

  getTypeId(type: string): number {
    return this.byType.get(type)?.id ?? JSON_FALLBACK_ID;
  }

  getTypeName(typeId: number): string | undefined {
    if (typeId === JSON_FALLBACK_ID) return undefined;
    return this.byId.get(typeId)?.type;
  }
}
