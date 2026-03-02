import Link from "next/link";
import Logo from "@/components/Logo";

const DOC_LINKS = [
  { href: "/docs/quick-start", label: "Quick Start" },
  { href: "/docs/modules/core", label: "@painda/core" },
  { href: "/docs/modules/chat", label: "@painda/chat" },
  { href: "/docs/modules/gaming", label: "@painda/gaming" },
  { href: "/docs/modules/video", label: "@painda/video" },
  { href: "/docs/benchmarks", label: "Benchmarks" },
  { href: "/test", label: "Live Test" },
];

export default function DocsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <aside className="fixed left-0 top-0 z-20 h-full w-56 border-r border-foreground/10 bg-background/95 py-6 pl-6 pr-4">
        <Link href="/" className="mb-6 flex items-center gap-2">
          <Logo className="h-8 w-8 text-accent" />
          <span className="text-sm font-medium text-foreground">PaindaProtocol</span>
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          <Link
            href="/docs"
            className="rounded px-2 py-1.5 text-foreground/70 hover:bg-accent-muted hover:text-accent"
          >
            Overview
          </Link>
          {DOC_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="rounded px-2 py-1.5 text-foreground/70 hover:bg-accent-muted hover:text-accent"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="relative z-10 pl-56 pr-8 py-12 max-w-3xl">
        {children}
      </main>
    </div>
  );
}
