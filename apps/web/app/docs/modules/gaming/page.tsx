export default function GamingModuleDocs() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1 className="text-3xl font-semibold text-foreground mb-4">@painda/gaming</h1>
      <p className="text-foreground/80 text-lg mb-8">
        The legendary Delta Engine. Powering real-time state synchronization with minimal bandwidth.
      </p>

      <div className="bg-foreground/5 p-6 rounded-lg border border-foreground/10 mb-8">
        <h2 className="text-xl font-medium text-foreground mb-4 mt-0">Why the Delta Engine?</h2>
        <ul className="space-y-2 text-foreground/70">
          <li><strong>Bandwidth Saver:</strong> When broadcasting a game state at 60 FPS, sending the full JSON every frame destroys the network.</li>
          <li><strong>Smart Diffing:</strong> The engine automatically compares the previous game state with the new one.</li>
          <li><strong>Micro Patches:</strong> It only sends the exact fields that have changed (the "Delta"), drastically reducing payload sizes.</li>
        </ul>
      </div>

      <h2 className="text-2xl font-medium text-foreground mb-4">Usage Example</h2>

      <p className="text-foreground/70 mb-4">
        1. On the Server: Creating patches
      </p>
      <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8 text-sm overflow-x-auto">
        <code className="text-foreground/90">{`import { StateManager } from "@painda/gaming";

const gameState = new StateManager({
  players: {
    hero1: { x: 10, y: 20, hp: 100 }
  }
});

// The game loop advances...
gameState.update({
  players: {
    hero1: { x: 15, y: 20, hp: 100 } // only X changed!
  }
});

// Get the patch
const patch = gameState.getDelta();

if (patch) {
  // patch will be purely { players: { hero1: { x: 15 } } }
  server.broadcast({ type: "game-update", payload: patch });
}
`}</code>
      </pre>

      <p className="text-foreground/70 mb-4">
        2. On the Client: Applying patches
      </p>
      <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8 text-sm overflow-x-auto">
        <code className="text-foreground/90">{`import { patch } from "@painda/gaming";

let localState = { players: { hero1: { x: 10, y: 20, hp: 100 } } };

client.on("message", (msg) => {
  if (msg.type === "game-update") {
     localState = patch(localState, msg.payload);
     // local state is now automatically updated!
  }
});`}</code>
      </pre>
    </div>
  );
}
