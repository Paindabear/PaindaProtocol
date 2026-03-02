import Link from "next/link";

export default function QuickStartPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
        Quick Start
      </h1>
      <p className="mt-4 text-foreground/80">
        Get PaindaProtocol running and build a &quot;Hello World&quot; chat in under 2 minutes.
      </p>

      <h2 className="mt-10 text-xl font-medium text-foreground">Installation</h2>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-accent/30 bg-foreground/5 px-4 py-3 font-mono text-sm text-accent">
        <code>npm install @painda/core</code>
      </pre>

      <h2 className="mt-10 text-xl font-medium text-foreground">Hello World Chat</h2>
      <p className="mt-2 text-foreground/80">
        Create a minimal server and client that exchange a single binary-framed message.
      </p>

      <h3 className="mt-6 text-lg font-medium text-foreground">Server</h3>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-accent/30 bg-foreground/5 px-4 py-3 font-mono text-sm text-foreground/90">
        <code>{`import { PPServer } from '@painda/core';

const server = new PPServer({ port: 3000 });

server.on('connection', (client) => {
  client.on('message', (data) => {
    console.log('Received:', data);
    client.send({ type: 'hello', payload: 'World' });
  });
});`}</code>
      </pre>

      <h3 className="mt-6 text-lg font-medium text-foreground">Client</h3>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-accent/30 bg-foreground/5 px-4 py-3 font-mono text-sm text-foreground/90">
        <code>{`import { PPClient } from '@painda/core';

const client = new PPClient({ url: 'ws://localhost:3000' });

client.on('open', () => {
  client.send({ type: 'greet', payload: 'Hello' });
});

client.on('message', (data) => {
  console.log('Server says:', data.payload); // "World"
});`}</code>
      </pre>

      <h2 className="mt-10 text-xl font-medium text-foreground">Typed Contracts</h2>
      <p className="mt-2 text-foreground/80">
        Register schemas for binary-native serialization with full TypeScript inference. No more JSON overhead.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg border border-accent/30 bg-foreground/5 px-4 py-3 font-mono text-sm text-foreground/90">
        <code>{`import {
  PPServer,
  PPSchemaRegistry,
  structSerializer,
} from '@painda/core';

// Define a binary schema for player positions
const registry = new PPSchemaRegistry();

registry.register('player:move', structSerializer(1, [
  { name: 'x', type: 'float32' },
  { name: 'y', type: 'float32' },
  { name: 'z', type: 'float32' },
]));

// Pass the registry to the server
const server = new PPServer({
  port: 3000,
  mode: 'gaming',
  registry,
});

server.on('connection', (client) => {
  client.on('message', (msg) => {
    if (msg.type === 'player:move') {
      const { x, y, z } = msg.payload as { x: number; y: number; z: number };
      console.log(\`Player moved to \${x}, \${y}, \${z}\`);
    }
  });

  // Send a typed binary message (12 bytes instead of ~50+ JSON bytes)
  client.send({ type: 'player:move', payload: { x: 1.5, y: 0, z: -3.2 } });
});`}</code>
      </pre>
      <p className="mt-4 text-sm text-foreground/60">
        The schema registry maps <code className="rounded bg-foreground/10 px-1 text-accent">player:move</code> to a compact 12-byte struct (3 x float32) instead of a ~50-byte JSON string. Unregistered types fall back to JSON automatically.
      </p>

      <p className="mt-6 text-foreground/80">
        Next, explore{" "}
        <Link href="/docs/modules/chat" className="text-accent hover:underline">PP.Chat</Link> for rooms and history, or{" "}
        <Link href="/docs/pp-header" className="text-accent hover:underline">The PP Header</Link> for the binary wire format.
      </p>
    </article>
  );
}
