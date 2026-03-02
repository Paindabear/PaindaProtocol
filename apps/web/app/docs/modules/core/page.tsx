export default function CoreModuleDocs() {
    return (
        <div className="prose prose-invert max-w-none">
            <h1 className="text-3xl font-semibold text-foreground mb-4">@painda/core</h1>
            <p className="text-foreground/80 text-lg mb-8">
                The blazing fast binary backbone of the PaindaProtocol ecosystem.
            </p>

            <div className="bg-foreground/5 p-6 rounded-lg border border-foreground/10 mb-8">
                <h2 className="text-xl font-medium text-foreground mb-4 mt-0">Why @painda/core?</h2>
                <ul className="space-y-2 text-foreground/70">
                    <li><strong>Zero-Copy Architecture:</strong> Reads direct ArrayBuffers instead of expensive string parsing.</li>
                    <li><strong>Typed Contracts:</strong> Schema registry ensures server and client speak the exact same language.</li>
                    <li><strong>Transport Agnostic:</strong> Currently wraps WebSockets, built ready for WebTransport.</li>
                </ul>
            </div>

            <h2 className="text-2xl font-medium text-foreground mb-4">Installation</h2>
            <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8">
                <code className="text-accent">npm install @painda/core</code>
            </pre>

            <h2 className="text-2xl font-medium text-foreground mb-4">Basic Usage</h2>
            <p className="text-foreground/70 mb-4">
                1. Define your Schema Registry (Shared between Client and Server)
            </p>
            <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8 text-sm overflow-x-auto">
                <code className="text-foreground/90">{`import { PPSchemaRegistry } from "@painda/core";

const registry = new PPSchemaRegistry();

registry.register("chat-message", {
  id: 1,
  encode: (msg) => new TextEncoder().encode(JSON.stringify(msg)),
  decode: (buf) => JSON.parse(new TextDecoder().decode(buf)),
});`}</code>
            </pre>

            <p className="text-foreground/70 mb-4">
                2. Start the Server
            </p>
            <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8 text-sm overflow-x-auto">
                <code className="text-foreground/90">{`import { PPServer } from "@painda/core";

const server = new PPServer({ port: 7001, registry });

server.on("connection", (client) => {
  client.on("message", (msg) => {
    // msg is completely type-safe!
    console.log("Received:", msg.payload);
    server.broadcast(msg);
  });
});`}</code>
            </pre>
        </div>
    );
}
