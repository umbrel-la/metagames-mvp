"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GameRecord } from "@/lib/types";

type SortOrder = "desc" | "asc";

const compareText = (a: string, b: string) =>
  a === b ? 0 : a.toLowerCase() < b.toLowerCase() ? -1 : 1;

const Score = ({ value }: { value: number | null }) => (
  <span className={value === null ? "score score-empty" : "score"}>
    {value ?? "—"}
  </span>
);

export function GameBrowser({
  games,
  configured,
}: {
  games: GameRecord[];
  configured: boolean;
}) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("All");
  const [sort, setSort] = useState<SortOrder>("desc");

  const platforms = useMemo(
    () =>
      [
        ...new Set(
          games.flatMap((game) =>
            game.platforms.map((item) => item.platform),
          ),
        ),
      ].sort(compareText),
    [games],
  );

  const visibleGames = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return games
      .filter(
        (game) =>
          (!normalizedQuery ||
            game.title.toLowerCase().includes(normalizedQuery)) &&
          (platform === "All" ||
            game.platforms.some((item) => item.platform === platform)),
      )
      .sort((a, b) => {
        const aScore = a.maxMetascore;
        const bScore = b.maxMetascore;
        if (aScore === null && bScore === null) {
          return compareText(a.title, b.title);
        }
        if (aScore === null) return 1;
        if (bScore === null) return -1;
        return sort === "desc" ? bScore - aScore : aScore - bScore;
      });
  }, [games, platform, query, sort]);

  return (
    <>
      <section className="controls" aria-label="Game filters">
        <label className="search-field">
          <span>Search games</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “Silent”"
          />
        </label>
        <label>
          <span>Platform</span>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
          >
            <option>All</option>
            {platforms.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
          >
            <option value="desc">Rating ↓</option>
            <option value="asc">Rating ↑</option>
          </select>
        </label>
      </section>

      {!configured ? (
        <div className="empty-state">
          <strong>Database is not connected</strong>
          <p>Add Turso variables, apply the migration, and run the scraper.</p>
        </div>
      ) : games.length === 0 ? (
        <div className="empty-state">
          <strong>No games yet</strong>
          <p>The first hourly scrape will fill this library.</p>
        </div>
      ) : visibleGames.length === 0 ? (
        <div className="empty-state">
          <strong>No matching games</strong>
          <p>Try another title or platform.</p>
        </div>
      ) : (
        <section className="game-grid" aria-live="polite">
          {visibleGames.map((game) => (
            <Link className="game-card" href={`/game/${game.slug}`} key={game.id}>
              <div className="cover">
                {game.cover_url ? (
                  <Image
                    src={game.cover_url}
                    alt=""
                    fill
                    sizes="(max-width: 520px) 45vw, (max-width: 760px) 30vw, (max-width: 980px) 22vw, 170px"
                  />
                ) : (
                  <span>No cover</span>
                )}
              </div>
              <div className="card-copy">
                <h2 title={game.title}>{game.title}</h2>
                <div className="card-score-row">
                  <Score value={game.maxMetascore} />
                </div>
                <div className="platform-list">
                  {game.platforms.map((item) => (
                    <span key={item.platform}>{item.platform}</span>
                  ))}
                </div>
                <div className="card-ratings">
                  {game.platforms.slice(0, 3).map((item) => (
                    <span key={item.platform}>
                      {item.platform}: {item.metascore ?? "—"} /{" "}
                      {item.userscore ?? "—"}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
