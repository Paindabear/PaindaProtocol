# @painda/video

**WebRTC signaling server module** for PaindaProtocol.

Handles SDP offer/answer exchange and ICE candidate relay for peer-to-peer video/audio calls.

Part of the [PaindaProtocol](https://pp.painda.tools) ecosystem.

## Installation

```bash
npm install @painda/video @painda/core
```

## Quick Start

```typescript
import { PPServer } from '@painda/core';
import { SignalingServer } from '@painda/video';

const server = new PPServer({ port: 3000 });
const signaling = new SignalingServer(server);

// Clients can now join calls and exchange WebRTC signals:
// 1. Client A sends { type: "signal", payload: { callId, signal: "offer", sdp } }
// 2. SignalingServer relays to Client B
// 3. Client B responds with "answer"
// 4. ICE candidates are exchanged automatically
```

## Signal Types

| Signal | Description |
|--------|-------------|
| `offer` | SDP offer from caller |
| `answer` | SDP answer from callee |
| `ice-candidate` | ICE candidate for NAT traversal |
| `join` | Join a call room |
| `leave` | Leave a call room |

## License

MIT
