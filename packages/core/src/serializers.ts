import type { PPSchema } from "./schema.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function jsonSerializer<T = unknown>(id: number): PPSchema<T> {
  return {
    id,
    encode: (data: T): Uint8Array => textEncoder.encode(JSON.stringify(data)),
    decode: (buf: Uint8Array): T => JSON.parse(textDecoder.decode(buf)) as T,
  };
}

export function stringSerializer(id: number): PPSchema<string> {
  return {
    id,
    encode: (data: string): Uint8Array => textEncoder.encode(data),
    decode: (buf: Uint8Array): string => textDecoder.decode(buf),
  };
}

export function bufferSerializer(id: number): PPSchema<Uint8Array> {
  return {
    id,
    encode: (data: Uint8Array): Uint8Array => data,
    decode: (buf: Uint8Array): Uint8Array => buf,
  };
}

export interface StructField {
  name: string;
  type: "uint8" | "uint16" | "uint32" | "int8" | "int16" | "int32" | "float32" | "float64";
}

const FIELD_SIZES: Record<StructField["type"], number> = {
  uint8: 1,
  uint16: 2,
  uint32: 4,
  int8: 1,
  int16: 2,
  int32: 4,
  float32: 4,
  float64: 8,
};

const FIELD_WRITERS: Record<StructField["type"], (view: DataView, offset: number, value: number) => void> = {
  uint8: (v, o, val) => v.setUint8(o, val),
  uint16: (v, o, val) => v.setUint16(o, val),
  uint32: (v, o, val) => v.setUint32(o, val),
  int8: (v, o, val) => v.setInt8(o, val),
  int16: (v, o, val) => v.setInt16(o, val),
  int32: (v, o, val) => v.setInt32(o, val),
  float32: (v, o, val) => v.setFloat32(o, val),
  float64: (v, o, val) => v.setFloat64(o, val),
};

const FIELD_READERS: Record<StructField["type"], (view: DataView, offset: number) => number> = {
  uint8: (v, o) => v.getUint8(o),
  uint16: (v, o) => v.getUint16(o),
  uint32: (v, o) => v.getUint32(o),
  int8: (v, o) => v.getInt8(o),
  int16: (v, o) => v.getInt16(o),
  int32: (v, o) => v.getInt32(o),
  float32: (v, o) => v.getFloat32(o),
  float64: (v, o) => v.getFloat64(o),
};

export function structSerializer<T extends Record<string, number>>(
  id: number,
  fields: StructField[],
): PPSchema<T> {
  const totalSize = fields.reduce((sum, f) => sum + FIELD_SIZES[f.type], 0);

  return {
    id,
    encode: (data: T): Uint8Array => {
      const buf = new ArrayBuffer(totalSize);
      const view = new DataView(buf);
      let offset = 0;
      for (const field of fields) {
        FIELD_WRITERS[field.type](view, offset, data[field.name]);
        offset += FIELD_SIZES[field.type];
      }
      return new Uint8Array(buf);
    },
    decode: (buf: Uint8Array): T => {
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const result: Record<string, number> = {};
      let offset = 0;
      for (const field of fields) {
        result[field.name] = FIELD_READERS[field.type](view, offset);
        offset += FIELD_SIZES[field.type];
      }
      return result as T;
    },
  };
}
