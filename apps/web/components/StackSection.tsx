const MODULES = [
  {
    name: "@painda/core",
    tag: "always included",
    description: "The binary engine and wire-standard.",
  },
  {
    name: "@painda/chat",
    description: "Rooms, message history, and presence.",
  },
  {
    name: "@painda/gaming",
    description: "Delta-compression and state sync for real-time games.",
  },
  {
    name: "@painda/video",
    description: "WebRTC signaling for low-latency P2P calls.",
  },
  {
    name: "@painda/sql-logger",
    description: "Persistence layer via Prisma.",
  },
];

export default function StackSection() {
  return (
    <section className="relative z-10 px-4 py-16 md:py-24">
      <h2 className="mb-4 text-center text-xl font-medium text-foreground/90 md:text-2xl">
        Your Stack
      </h2>
      <p className="mx-auto mb-10 max-w-2xl text-center text-sm text-foreground/60">
        One protocol. Install only what you need &mdash; everything runs through the same pipeline, fully typed.
      </p>
      <div className="mx-auto max-w-2xl space-y-3">
        {MODULES.map((m) => (
          <div
            key={m.name}
            className="flex flex-col gap-1 rounded-lg border border-foreground/10 bg-foreground/[0.02] px-5 py-4 transition hover:border-accent/30 hover:bg-accent-muted sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex items-center gap-2">
              <code className="text-sm font-medium text-accent">{m.name}</code>
              {m.tag && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                  {m.tag}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground/70">{m.description}</p>
          </div>
        ))}
      </div>
      <pre className="mx-auto mt-8 max-w-xl overflow-x-auto rounded-lg border border-accent/30 bg-foreground/5 px-4 py-3 text-center font-mono text-sm text-accent">
        npm install @painda/core @painda/gaming @painda/chat
      </pre>
    </section>
  );
}
