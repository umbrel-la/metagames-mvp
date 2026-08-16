import { GameBrowser } from "@/components/game-browser";
import { isDatabaseConfigured, listGames } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const games = await listGames();

  return (
    <main className="shell">
      <header className="site-header">
        <Link className="brand" href="/">
          Meta<span>Games</span>
        </Link>
        <div className="header-meta">
          <Link className="back-link" href="/dashboard">
            Scraper monitor
          </Link>
          <div className="library-count">
            <span>{games.length}</span> games indexed
          </div>
        </div>
      </header>
      <section className="hero">
        <p className="eyebrow">Curated from Metacritic</p>
        <h1>Find your next game.</h1>
        <p>
          Fresh releases, platform scores, and review insights—updated every
          hour.
        </p>
      </section>
      <GameBrowser games={games} configured={isDatabaseConfigured()} />
    </main>
  );
}
