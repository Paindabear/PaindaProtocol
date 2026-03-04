# @painda/auth

**Authentication middleware** for PaindaProtocol.

Token-based auth with configurable validators, guest access, and timeout handling.

Part of the [PaindaProtocol](https://pp.painda.tools) ecosystem.

## Installation

```bash
npm install @painda/auth @painda/core
```

## Quick Start

```typescript
import { PPServer } from '@painda/core';
import { PPAuthMiddleware } from '@painda/auth';

const server = new PPServer({ port: 3000 });

const auth = new PPAuthMiddleware(server, {
  validator: async (token) => {
    // Validate JWT, API key, etc.
    const user = await verifyToken(token);
    if (!user) throw new Error('Invalid token');
    return user; // attached to socket.userContext
  },
  authTimeout: 5000,  // 5s to authenticate
  allowGuest: false,  // require authentication
});

server.on('connection', (client) => {
  if (auth.isAuthenticated(client)) {
    // Client is verified
    const user = (client as any).userContext;
    console.log('Authenticated:', user.name);
  }
});
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `validator` | required | `(token) => user \| boolean` |
| `authTimeout` | `5000` | Ms before auto-disconnect |
| `allowGuest` | `false` | Allow connections without token |

## Flow

1. Client connects → auth timer starts
2. Client sends `{ type: "authenticate", payload: { token } }`
3. Validator runs → success: `auth-success` / fail: disconnect with `4002`
4. Timeout → disconnect with `4001`

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
