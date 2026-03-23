# 🐼 @painda/admin

**Real-time monitoring and management dashboard for PaindaProtocol.**

`@painda/admin` provides a powerful interface for overseeing your real-time infrastructure. Monitor server health, track connected clients, manage rooms, and visualize performance metrics through a sleek, low-latency dashboard.

### ⚡ Highlights

- **Live Server Stats**: Monitor CPU, memory, and connection counts in real-time.
- **Client Management**: Inspect and manage individual socket connections.
- **Room Oversight**: View active rooms and their current synchronization states.
- **Real-Time Logs**: Stream server logs directly to the admin interface for easy debugging.

## Installation

```bash
npm install @painda/admin @painda/core
```

## Quick Start

```typescript
import { PPServer } from '@painda/core';
import { PPAdmin } from '@painda/admin';

const server = new PPServer({ port: 3000 });
const admin = new PPAdmin(server, {
  auth: { username: "admin", password: "secure-password" },
  port: 7000, // Dashboard on separate port
});
```

## License

**MIT License** — free for private projects, open-source, and community use.
