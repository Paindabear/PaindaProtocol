# 🐼 @painda/auth

**Secure, token-based authentication middleware for PaindaProtocol.**

`@painda/auth` provides a robust, customizable authentication layer for your real-time applications. It supports JWT, API keys, and custom validation logic with built-in protection against slow-loris auth attacks and unauthorized connections.

### ⚡ Highlights

- **Pluggable Validators**: Use any async function to verify tokens (JWT, DB lookup, etc.).
- **Automatic Enforcement**: Protects your server by enforcing auth before any message handling.
- **Timeout Protection**: Automatically disconnects clients that fail to authenticate within a window.
- **Guest Support**: Configurable "allow-guest" mode for public rooms.

## Installation

```bash
npm install @painda/auth @painda/core
```

---

## Authentication Flows

PaindaProtocol supports two authentication flows. Choose the one that fits your security requirements.

### Flow 1: Query-Parameter Auth (Recommended for most use cases)

The client sends the token automatically as a `?token=` query parameter on every (re)connection. This is handled by `PPClient`'s `getToken` callback — **no extra code needed on the client**.

**Client:**
```typescript
import { PPClient } from "@painda/client";

const client = new PPClient({
  url: "ws://localhost:3000",
  getToken: async () => {
    // Called on EVERY connect & reconnect — always a fresh token
    return await refreshJwtToken();
  },
});
// Token is automatically appended as ?token=<value> on the WS URL
```

**Server (using `server.use()` middleware):**
```typescript
import { PPServer } from "@painda/core";

const server = new PPServer({ port: 3000 });

server.use(async (socket, next) => {
  // Token arrives as ?token= query parameter
  const url = new URL(`ws://x${socket.request.url}`);
  const token = url.searchParams.get("token");

  if (!token) return next(new Error("No token provided"));

  try {
    const user = await verifyJwt(token);
    socket.data.user = user; // Attach user to socket
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

server.on("connection", (client) => {
  console.log("Authenticated user:", client.data.user);
});
```

> **Note:** With PaindaProtocol's core client (`@painda/core/common/client`), tokens are sent as the **first binary frame** after connect instead of URL query params. This avoids token leakage in proxy/server logs. The `@painda/client` browser package uses URL query params for compatibility.

---

### Flow 2: Post-Connect Authentication (via `@painda/auth`)

For scenarios where the token should **not** appear in the URL (e.g., strict security policies, proxy logging concerns). The client sends an `authenticate` message after connecting.

**Server:**
```typescript
import { PPServer } from "@painda/core";
import { PPAuthMiddleware } from "@painda/auth";

const server = new PPServer({ port: 3000 });

const auth = new PPAuthMiddleware(server, {
  validator: async (token) => {
    const user = await verifyJwt(token);
    if (!user) throw new Error("Invalid token");
    return user; // Attached to socket as `userContext`
  },
  authTimeout: 5000, // Client has 5s to authenticate
  allowGuest: false,
});

server.on("connection", (client) => {
  if (auth.isAuthenticated(client)) {
    const user = (client as any).userContext;
    console.log("Authenticated:", user.name);
  }
});
```

**Client:**
```typescript
import { PPClient } from "@painda/client";

const client = new PPClient({ url: "ws://localhost:3000" });

// After connecting, send the authenticate message manually:
client.on("open", async () => {
  const token = await getStoredToken();
  client.emit("authenticate", { token });
});

// Listen for auth result:
client.on("auth-success", () => console.log("✅ Authenticated!"));
client.on("auth-error", (err) => console.error("❌ Auth failed:", err));
```

---

### When to use which flow?

| Criterion | Flow 1: Query-Parameter | Flow 2: Post-Connect (`@painda/auth`) |
|-----------|------------------------|--------------------------------------|
| **Simplicity** | ✅ Automatic via `getToken` | 🔶 Manual `authenticate` message |
| **JWT Refresh** | ✅ Auto-refreshed on every reconnect | 🔶 Must re-send manually |
| **Token Visibility** | ⚠️ In URL (potential log/proxy exposure) | ✅ In message body only |
| **Recommended for** | Standard apps, games, SPAs | High-security, banking, enterprise |

---

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `validator` | required | `(token) => user \| boolean` — validate token and return user object |
| `authTimeout` | `5000` | Milliseconds before auto-disconnect for unauthenticated clients |
| `allowGuest` | `false` | Allow connections without a token (sets `userContext.guest = true`) |

## Post-Connect Auth Flow

1. Client connects → auth timer starts (`authTimeout` ms)
2. Client sends `{ type: "authenticate", payload: { token } }`
3. Validator runs → success: `auth-success` response / fail: disconnect with code `4002`
4. Timeout reached without auth → disconnect with code `4001`

## License

**MIT License** — free for private projects, open-source, and community use.

- **Enterprise (Paid):** Commercial projects above a certain company size or revenue threshold require a commercial license. Inquiries via [pp.painda.tools/enterprise](https://pp.painda.tools/enterprise).
- **Pro Plugins:** Premium modules (Dashboard, Redis Adapter, Enterprise Support) available at [pp.painda.tools/plugins](https://pp.painda.tools/plugins).
