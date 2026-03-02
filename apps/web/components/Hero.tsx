import Link from "next/link";
import Logo from "./Logo";
import CopyButton from "./CopyButton";

export default function Hero() {
  return (
    <header className="relative z-10 flex flex-col items-center px-4 pt-16 pb-12 text-center md:pt-24 md:pb-16">
      <Link href="/" className="mb-10 inline-block" aria-label="PaindaProtocol Home">
        <Logo className="h-14 w-14 text-accent md:h-16 md:w-16" />
      </Link>
      <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-foreground md:text-4xl lg:text-5xl">
        PaindaProtocol (PP) – The High-Performance Backbone for Real-Time Apps.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-foreground/80 md:text-xl">
        Faster than Socket.io. Built for Games, Media-Heavy Chats, and Low-Latency Voice Calls.
      </p>
      <div className="mt-10 w-full max-w-xl">
        <CopyButton />
      </div>
      <nav className="mt-8 flex gap-6 text-sm">
        <Link href="/docs" className="text-accent underline decoration-accent/50 underline-offset-4 hover:decoration-accent">
          Docs
        </Link>
        <Link href="/docs/quick-start" className="text-accent underline decoration-accent/50 underline-offset-4 hover:decoration-accent">
          Quick Start
        </Link>
        <Link href="/test" className="text-accent underline decoration-accent/50 underline-offset-4 hover:decoration-accent">
          Test
        </Link>
      </nav>
      <p className="mt-6 text-xs tracking-widest uppercase text-foreground/50">
        Binary Speed. Typed Power. Built for Performance.
      </p>
    </header>
  );
}
