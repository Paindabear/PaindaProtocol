import { PPServer, PPClient, PPSchemaRegistry } from "@painda/core";
import { RoomManager, directMessage } from "./src/index.js";

// 1. Setup minimal registry
const registry = new PPSchemaRegistry();
registry.register("chat-message", {
    id: 1,
    encode: (str: string) => new TextEncoder().encode(str),
    decode: (buf: Uint8Array) => new TextDecoder().decode(buf)
});

// 2. Start mock server
const server = new PPServer({ port: 7005, registry });
const rooms = new RoomManager(server);

console.log("Starting Chat Test...");

// Server-side logic for routing chat
server.on("connection", (client) => {
    client.on("message", (msg) => {
        if (msg.type === "chat-message") {
            const text = msg.payload as string;

            if (text.startsWith("/join ")) {
                const room = text.split(" ")[1];
                rooms.join(client, room);
                client.send({ type: "chat-message", payload: `[Server] You joined ${room}` });
            }
            else if (text.startsWith("/leave ")) {
                const room = text.split(" ")[1];
                rooms.leave(client, room);
                client.send({ type: "chat-message", payload: `[Server] You left ${room}` });
            }
            else if (text.startsWith("/to ")) {
                const parts = text.split(" ");
                const room = parts[1];
                const content = parts.slice(2).join(" ");
                rooms.broadcastToRoom(room, { type: "chat-message", payload: `[${room}] ${content}` }, client);
            }
            else {
                // Echo back to sender
                client.send({ type: "chat-message", payload: `[Echo] ${text}` });
            }
        }
    });
});

// Keep event loop alive
const keepAlive = setInterval(() => { }, 1000);

// 3. Simulated Clients
setTimeout(() => {
    // Client A
    const clientA = new PPClient({ url: "ws://127.0.0.1:7005", registry });
    clientA.on("error", (e) => console.error("Client A error:", e));
    clientA.on("open", () => {
        clientA.send({ type: "chat-message", payload: "/join lobby" });
    });
    clientA.on("message", (msg) => {
        console.log(`Client A received: ${msg.payload}`);
    });

    // Client B
    const clientB = new PPClient({ url: "ws://127.0.0.1:7005", registry });
    clientB.on("error", (e) => console.error("Client B error:", e));
    clientB.on("open", () => {
        clientB.send({ type: "chat-message", payload: "/join lobby" });

        // Slight delay to ensure B joins *after* A
        setTimeout(() => {
            clientB.send({ type: "chat-message", payload: "/to lobby Hello Lobby, from B!" });

            // Clean exit after tests
            setTimeout(() => {
                clientA.close();
                clientB.close();
                server.close();
                console.log("Chat Test Complete.");
                clearInterval(keepAlive);
            }, 500);
        }, 300);
    });
    clientB.on("message", (msg) => {
        console.log(`Client B received: ${msg.payload}`);
    });
}, 500);
