# 🐼 @painda/video

**Reliable, low-latency WebRTC signaling for PaindaProtocol.**

`@painda/video` provides a robust signaling layer for peer-to-peer communication. It handles complex SDP negotiations and ICE candidate relaying, allowing you to integrate high-quality video and audio calls directly into your real-time applications with minimal setup.

### ⚡ Highlights

- **P2P Signaling**: Optimized for NAT traversal and low-latency peer discovery.
- **Room-Based Calling**: Integrated support for call rooms and multi-peer discovery.
- **Protocol-First**: Leverages Painda's binary framing for lightweight signaling overhead.
- **Developer Friendly**: Simplified API for offer/answer and candidate exchange.

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

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
