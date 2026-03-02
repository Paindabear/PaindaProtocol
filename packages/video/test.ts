import { PPServer, PPClient, PPSchemaRegistry } from "@painda/core";
import { SignalingServer, type RTCMessage } from "./src/index.js";

// 1. Setup registry for RTC
const registry = new PPSchemaRegistry();
registry.register("rtc-signal", {
    id: 1,
    encode: (msg: RTCMessage) => new TextEncoder().encode(JSON.stringify(msg)),
    decode: (buf: Uint8Array) => JSON.parse(new TextDecoder().decode(buf)) as RTCMessage
});

// 2. Start mock server
const server = new PPServer({ port: 7006, registry });
const signaling = new SignalingServer(server);

console.log("Starting Video Signaling Test...");

// Server-side logic to feed signaling
server.on("connection", (client) => {
    client.on("message", (msg) => {
        if (msg.type === "rtc-signal") {
            signaling.handleSignal(client, msg);
        }
    });
});

// Keep event loop alive
const keepAlive = setInterval(() => { }, 1000);

let callerId = "";

// 3. Simulated Peer Clients
setTimeout(() => {
    // Caller
    const caller = new PPClient({ url: "ws://127.0.0.1:7006", registry });
    caller.on("open", () => {
        caller.send({ type: "rtc-signal", payload: { type: "join", roomId: "call1" } });
        console.log("Caller joined call1.");
    });
    caller.on("message", (msg) => {
        const payload = msg.payload as RTCMessage;
        if (payload.type === "join") {
            console.log(`Caller sees Callee join. Sending Offer to ${payload.senderId}...`);
            caller.send({ type: "rtc-signal", payload: { type: "offer", roomId: "call1", targetId: payload.senderId, payload: { sdp: "offer_data" } } });
        } else if (payload.type === "answer") {
            console.log(`Caller received Answer from ${payload.senderId}: ${payload.payload.sdp}`);

            // Final success
            caller.close();
            callee.close();
            server.close();
            console.log("Video Signaling Test Complete.");
            clearInterval(keepAlive);
        }
    });

    // Callee
    const callee = new PPClient({ url: "ws://127.0.0.1:7006", registry });
    callee.on("open", () => {
        setTimeout(() => {
            callee.send({ type: "rtc-signal", payload: { type: "join", roomId: "call1" } });
            console.log("Callee joined call1.");
        }, 100);
    });
    callee.on("message", (msg) => {
        const payload = msg.payload as RTCMessage;
        if (payload.type === "offer") {
            console.log(`Callee received Offer from ${payload.senderId}: ${payload.payload.sdp}`);
            console.log(`Callee sending Answer back to ${payload.senderId}...`);
            callee.send({ type: "rtc-signal", payload: { type: "answer", roomId: "call1", targetId: payload.senderId, payload: { sdp: "answer_data" } } });
        }
    });
}, 500);
