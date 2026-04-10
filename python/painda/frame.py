import struct
import json
import zlib
from enum import IntEnum
from typing import Any, Dict, Optional, Tuple, NamedTuple

PP_MAGIC = 0x50504E44  # "PPND"
PP_VERSION_2 = 2

class PPMode(IntEnum):
    SYSTEM = 0
    EVENT = 1
    STATE = 2
    BINARY = 3

FLAG_COMPRESSED = 0x04
FLAG_SCHEMA = 0x08
HEADER_SIZE_V2 = 16

class PPHeader(NamedTuple):
    version: int
    mode: PPMode
    compressed: bool
    payload_length: int
    type_id: int

def encode_frame(
    mode: PPMode, 
    payload_data: Any, 
    type_id: int = 0, 
    compress: bool = False,
    compression_threshold: int = 256
) -> bytes:
    """
    Encode data into a PaindaProtocol v2 binary frame.
    """
    if type_id == 0:
        # JSON Fallback
        payload = json.dumps(payload_data).encode('utf-8')
    else:
        # Schema encoding (To be implemented with PPSchemaRegistry port)
        payload = payload_data if isinstance(payload_data, bytes) else b''
    
    flags = int(mode) & 0x03
    if type_id > 0:
        flags |= FLAG_SCHEMA
    
    is_compressed = False
    if compress and len(payload) >= compression_threshold:
        compressed_payload = zlib.compress(payload)
        if len(compressed_payload) < len(payload):
            payload = compressed_payload
            is_compressed = True
            flags |= FLAG_COMPRESSED

    # Build Header V2 (16 bytes, Big-Endian)
    header = struct.pack(
        '>IHHIII', 
        PP_MAGIC, 
        PP_VERSION_2, 
        flags, 
        len(payload), 
        type_id, 
        0 # Reserved
    )
    
    return header + payload

def decode_frame(data: bytes) -> Tuple[PPHeader, Any]:
    """
    Decode a PaindaProtocol v2 binary frame.
    """
    if len(data) < HEADER_SIZE_V2:
        raise ValueError(f"Frame too small: {len(data)} bytes")
    
    # Unpack Header
    magic, version, flags, payload_len, type_id, _ = struct.unpack('>IHHIII', data[:HEADER_SIZE_V2])
    
    if magic != PP_MAGIC:
        raise ValueError(f"Invalid magic: {hex(magic)}")
    
    mode = PPMode(flags & 0x03)
    compressed = bool(flags & FLAG_COMPRESSED)
    has_schema = bool(flags & FLAG_SCHEMA)
    
    payload = data[HEADER_SIZE_V2:HEADER_SIZE_V2 + payload_len]
    
    if compressed:
        payload = zlib.decompress(payload)
    
    if has_schema and type_id != 0:
        # Schema decoding (To be implemented)
        decoded_data = payload
    else:
        decoded_data = json.loads(payload.decode('utf-8'))
        
    header = PPHeader(version, mode, compressed, len(payload), type_id)
    return header, decoded_data
