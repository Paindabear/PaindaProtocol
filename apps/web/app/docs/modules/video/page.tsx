export default function VideoModuleDocs() {
  return (
    <div className="prose prose-invert max-w-none">
      <h1 className="text-3xl font-semibold text-foreground mb-4">@painda/video</h1>
      <p className="text-foreground/80 text-lg mb-8">
        A fast WebRTC signaling server built directly into PaindaProtocol.
      </p>

      <div className="bg-foreground/5 p-6 rounded-lg border border-foreground/10 mb-8">
        <h2 className="text-xl font-medium text-foreground mb-4 mt-0">How it works</h2>
        <ul className="space-y-2 text-foreground/70">
          <li><strong>Out-of-the-Box Signaling:</strong> WebRTC requires a central server to exchange SDP Offers, Answers, and ICE candidates before establishing a P2P connection.</li>
          <li><strong>Room Based:</strong> Clients join a "Call Room" and the Signaling server automatically targets the right peers.</li>
          <li><strong>Zero Setup routing:</strong> The \`SignalingServer\` class handles all message delegation for you.</li>
        </ul>
      </div>

      <h2 className="text-2xl font-medium text-foreground mb-4">Server Usage</h2>

      <pre className="bg-background border border-foreground/10 p-4 rounded-lg mb-8 text-sm overflow-x-auto">
        <code className="text-foreground/90">{`import { PPServer } from "@painda/core";
import { SignalingServer } from "@painda/video";

const server = new PPServer({ port: 7001, registry });
const rtcManager = new SignalingServer(server);

server.on("connection", (client) => {
  client.on("message", (msg) => {
    if (msg.type === "rtc-signal") {
      // Handles join, leave, offer, answer, and candidate routing
      rtcManager.handleSignal(client, msg);
    }
  });
});
`}</code>
      </pre>

    </div>
  );
}
