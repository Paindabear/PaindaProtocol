export default function ChatModuleDocs() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1 className="text-3xl font-semibold text-foreground mb-4">@painda/chat</h1>
      <p className="text-foreground/80 text-lg mb-8">
        Full-featured room management and direct messaging built on the blazing fast Painda core.
      </p>

      <div className="bg-foreground/5 p-6 rounded-lg border border-foreground/10 mb-8">
        <h2 className="text-xl font-medium text-foreground mb-4 mt-0">Features</h2>
        <ul className="space-y-2 text-foreground/70">
          <li><strong>RoomManager:</strong> Easily join, leave, and broadcast to specific rooms just like Socket.io.</li>
          <li><strong>Direct Messaging:</strong> Send targeted whispers / private messages between specific client connection IDs.</li>
          <li><strong>Decoupled:</strong> Use it alongside the Gaming or Video modules seamlessly.</li>
        </ul>
      </div>

      <h2 className="text-2xl font-medium text-foreground mb-4">Usage Example</h2>
      <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8 text-sm overflow-x-auto">
        <code className="text-foreground/90">{`import { PPServer } from "@painda/core";
import { RoomManager } from "@painda/chat";

const server = new PPServer({ port: 7001, registry });
const rooms = new RoomManager(server);

server.on("connection", (client) => {
  // Join a room
  rooms.join(client, "global-lobby");

  // Broadcast to the room (excluding sender)
  rooms.broadcastToRoom("global-lobby", { 
    type: "chat-message", 
    payload: "Hello world!" 
  }, client);

  // Leave room
  rooms.leave(client, "global-lobby");
});`}</code>
      </pre>
    </div>
  );
}
