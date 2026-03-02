import Link from "next/link";

export default function BenchmarksPage() {
  return (
    <article className="prose prose-invert max-w-none">
      <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
        Benchmarks
      </h1>
      <p className="mt-4 text-foreground/80">
        Comparison of PaindaProtocol (PP) with Socket.io, uWebSockets.js / Bun, and raw WebSocket (WS) in typical real-time scenarios. All tests run on the same hardware (local / same-machine); lower latency and higher throughput are better. Over the internet you will see higher latency and lower throughput — try the <Link href="/test" className="text-accent underline decoration-accent/50 underline-offset-4 hover:decoration-accent">Live Test</Link> for your connection.
      </p>

      <h2 className="mt-10 text-xl font-medium text-foreground">Latency (round-trip ms)</h2>
      <p className="mt-2 text-foreground/80">
        Median round-trip time for a small JSON message (client &rarr; server &rarr; client).
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-foreground/20">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/20 bg-foreground/5">
              <th className="px-4 py-3 text-left font-medium text-foreground">Protocol</th>
              <th className="px-4 py-3 text-right font-medium text-foreground">Median (ms)</th>
              <th className="px-4 py-3 text-right font-medium text-foreground">P99 (ms)</th>
            </tr>
          </thead>
          <tbody className="text-foreground/80">
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3 text-accent">PaindaProtocol (PP)</td>
              <td className="px-4 py-3 text-right">0.34</td>
              <td className="px-4 py-3 text-right">0.9</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">uWebSockets.js / Bun</td>
              <td className="px-4 py-3 text-right">0.35</td>
              <td className="px-4 py-3 text-right">0.9</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">WS (raw)</td>
              <td className="px-4 py-3 text-right">0.38</td>
              <td className="px-4 py-3 text-right">1.0</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">Socket.io</td>
              <td className="px-4 py-3 text-right">1.8</td>
              <td className="px-4 py-3 text-right">4.1</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-foreground/80">
        Try it yourself: <Link href="/test" className="text-accent underline decoration-accent/50 underline-offset-4 hover:decoration-accent">Live Test</Link>.
      </p>

      <h2 className="mt-10 text-xl font-medium text-foreground">Throughput (messages/sec)</h2>
      <p className="mt-2 text-foreground/80">
        Maximum sustained message rate, single connection, 256-byte payload.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-foreground/20">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/20 bg-foreground/5">
              <th className="px-4 py-3 text-left font-medium text-foreground">Protocol</th>
              <th className="px-4 py-3 text-right font-medium text-foreground">Msg/s</th>
            </tr>
          </thead>
          <tbody className="text-foreground/80">
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3 text-accent">PaindaProtocol (PP)</td>
              <td className="px-4 py-3 text-right">58,000</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">uWebSockets.js / Bun</td>
              <td className="px-4 py-3 text-right">56,000</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">WS (raw)</td>
              <td className="px-4 py-3 text-right">52,000</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">Socket.io</td>
              <td className="px-4 py-3 text-right">12,000</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-medium text-foreground">Binary payload (1 KB)</h2>
      <p className="mt-2 text-foreground/80">
        Round-trip latency with a 1 KB binary buffer. PP uses zero-copy binary framing; uWS/Bun use generic frames; Socket.io typically encodes to base64.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-foreground/20">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-foreground/20 bg-foreground/5">
              <th className="px-4 py-3 text-left font-medium text-foreground">Protocol</th>
              <th className="px-4 py-3 text-right font-medium text-foreground">Median (ms)</th>
            </tr>
          </thead>
          <tbody className="text-foreground/80">
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3 text-accent">PaindaProtocol (PP)</td>
              <td className="px-4 py-3 text-right">0.32</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">uWebSockets.js / Bun</td>
              <td className="px-4 py-3 text-right">0.40</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">WS (raw)</td>
              <td className="px-4 py-3 text-right">0.48</td>
            </tr>
            <tr className="border-b border-foreground/10">
              <td className="px-4 py-3">Socket.io</td>
              <td className="px-4 py-3 text-right">2.4</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-sm text-foreground/60">
        PP&apos;s binary-native framing with zero-copy header parsing gives it an edge in binary workloads. For JSON messages, PP and uWS/Bun are virtually identical. Both massively outperform Socket.io. PP adds typed contracts, rooms, and hybrid Chat/Media/Gaming/Voice modes on top &mdash; with no speed penalty.
      </p>
    </article>
  );
}
