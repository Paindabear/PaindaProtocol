import Hero from "@/components/Hero";
import FeatureGrid from "@/components/FeatureGrid";
import StackSection from "@/components/StackSection";
import ComparisonTable from "@/components/ComparisonTable";
import Roadmap from "@/components/Roadmap";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <main>
        <Hero />
        <FeatureGrid />
        <StackSection />
        <ComparisonTable />
        <Roadmap />
      </main>
      <footer className="relative z-10 border-t border-foreground/10 px-4 py-8 text-center text-sm text-foreground/60">
        <Link href="/docs" className="text-accent hover:underline">
          Documentation
        </Link>
        {" · "}
        <a
          href="https://www.npmjs.com/package/@painda/core"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          npm
        </a>
      </footer>
    </div>
  );
}
