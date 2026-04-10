import { PPServer } from "../packages/core/dist/index.js";

const server = new PPServer({ port: 3002 });

server.on("connection", (socket) => {
    console.log("Python client connected!");
    
    // Send a binary-mode event
    socket.emit("test:event", {
        message: "Hello from Node.js!",
        timestamp: Date.now(),
        binary_parity: true
    });

    // Send a state-mode patch
    socket.emit("state:delta", {
        health: 50,
        score: { team1: 10 }
    }, { mode: "state" });
});

console.log("Test server listening on port 3002...");
