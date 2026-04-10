using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;

namespace PaindaProtocol
{
    public enum PPMode : ushort
    {
        System = 0,
        Event = 1,
        State = 2,
        Binary = 3
    }

    public struct PPHeader
    {
        public ushort Version;
        public PPMode Mode;
        public bool Compressed;
        public bool HasSchema;
        public uint PayloadLength;
        public ushort TypeId;
    }

    public static class PaindaFrame
    {
        public const uint PP_MAGIC = 0x50504E44; // "PPND"
        public const ushort PP_VERSION = 2;
        public const int HEADER_SIZE = 16;

        private const ushort FLAG_COMPRESSED = 0x04;
        private const ushort FLAG_SCHEMA = 0x08;

        public static byte[] Encode(PPMode mode, object payloadData, ushort typeId = 0)
        {
            byte[] payload;
            if (typeId == 0)
            {
                var json = JsonConvert.SerializeObject(new { type = "message", payload = payloadData });
                payload = Encoding.UTF8.GetBytes(json);
            }
            else
            {
                // Schema encoding would go here
                payload = new byte[0];
            }

            ushort flags = (ushort)((ushort)mode & 0x03);
            if (typeId > 0) flags |= FLAG_SCHEMA;

            // TODO: Implement Deflate compression if needed

            byte[] frame = new byte[HEADER_SIZE + payload.Length];
            
            // Header (Big-Endian)
            WriteUint32(frame, 0, PP_MAGIC);
            WriteUint16(frame, 4, PP_VERSION);
            WriteUint16(frame, 6, flags);
            WriteUint32(frame, 8, (uint)payload.Length);
            WriteUint16(frame, 12, typeId);
            WriteUint16(frame, 14, 0); // Reserved

            // Payload
            Buffer.BlockCopy(payload, 0, frame, HEADER_SIZE, payload.Length);

            return frame;
        }

        public static (PPHeader header, string json) Decode(byte[] data)
        {
            if (data.Length < HEADER_SIZE)
                throw new Exception("Frame too small");

            uint magic = ReadUint32(data, 0);
            if (magic != PP_MAGIC)
                throw new Exception("Invalid magic");

            ushort version = ReadUint16(data, 4);
            ushort flags = ReadUint16(data, 6);
            uint payloadLength = ReadUint32(data, 8);
            ushort typeId = ReadUint16(data, 12);

            var header = new PPHeader
            {
                Version = version,
                Mode = (PPMode)(flags & 0x03),
                Compressed = (flags & FLAG_COMPRESSED) != 0,
                HasSchema = (flags & FLAG_SCHEMA) != 0,
                PayloadLength = payloadLength,
                TypeId = typeId
            };

            // TODO: Handle compression

            string json = Encoding.UTF8.GetString(data, HEADER_SIZE, (int)payloadLength);
            return (header, json);
        }

        #region Endian Helpers (Big-Endian)
        
        private static void WriteUint32(byte[] buffer, int offset, uint value)
        {
            buffer[offset] = (byte)(value >> 24);
            buffer[offset + 1] = (byte)(value >> 16);
            buffer[offset + 2] = (byte)(value >> 8);
            buffer[offset + 3] = (byte)value;
        }

        private static void WriteUint16(byte[] buffer, int offset, ushort value)
        {
            buffer[offset] = (byte)(value >> 8);
            buffer[offset + 1] = (byte)value;
        }

        private static uint ReadUint32(byte[] buffer, int offset)
        {
            return (uint)((buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]);
        }

        private static ushort ReadUint16(byte[] buffer, int offset)
        {
            return (ushort)((buffer[offset] << 8) | buffer[offset + 1]);
        }

        #endregion
    }
}
