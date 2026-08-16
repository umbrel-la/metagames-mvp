import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameBySlug } from "@/lib/db";
import { getSimilarGames } from "@/lib/similarity";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);
  if (!game) notFound();
  const similar = await getSimilarGames(game);

  return (
    <main className="shell detail-shell">
      <header className="site-header">
        <Link className="brand" href="/">
          Meta<span>Games</span>
        </Link>
        <Link className="back-link" href="/">
          ← All games
        </Link>
      </header>

      <article>
        <section className="game-hero">
          <div className="detail-cover">
            {game.cover_url ? (
              <Image
                src={game.cover_url}
                alt={`${game.title} cover`}
                fill
                priority
                sizes="(max-width: 700px) 70vw, 320px"
              />
            ) : (
              <span>No cover available</span>
            )}
          </div>
          <div className="detail-intro">
            <p className="eyebrow">
              {game.developer || "Developer unavailable"}
            </p>
            <h1>{game.title}</h1>
            <p className="description">
              {game.description || "No description is available yet."}
            </p>
            <div className="detail-actions">
              <a
                className="primary-link"
                href={game.metacritic_url}
                target="_blank"
                rel="noreferrer"
              >
                View on Metacritic ↗
              </a>
              {game.video_url && (
                <a href={game.video_url} target="_blank" rel="noreferrer">
                  Watch video ↗
                </a>
              )}
            </div>
          </div>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <p className="eyebrow">Scores</p>
            <h2>Every platform</h2>
          </div>
          <div className="platform-scores">
            {game.platforms.length ? (
              game.platforms.map((platform) => (
                <div className="platform-score" key={platform.platform}>
                  <strong>{platform.platform}</strong>
                  <div>
                    <span>
                      Metascore <b>{platform.metascore ?? "—"}</b>
                    </span>
                    <span>
                      User score <b>{platform.userscore ?? "—"}</b>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p>Platform scores are not available yet.</p>
            )}
          </div>
        </section>

        <section className="detail-section">
          <div className="section-heading">
            <p className="eyebrow">Review intelligence</p>
            <h2>What reviewers are saying</h2>
          </div>
          <div className="summary-grid">
            <SummaryCard
              title="Critics"
              positive={game.critic_summary_positive}
              negative={game.critic_summary_negative}
            />
            <SummaryCard
              title="Users"
              positive={game.user_summary_positive}
              negative={game.user_summary_negative}
            />
          </div>
        </section>

        {game.youtube_url &&
          (game.youtube_summary_positive ||
            game.youtube_summary_negative ||
            game.youtube_summary_conclusion) && (
            <section className="detail-section">
              <div className="section-heading">
                <p className="eyebrow">Popular let&apos;s play</p>
                <h2>What the creator thinks</h2>
              </div>
              <div className="summary-card youtube-card">
                <div className="youtube-heading">
                  <div>
                    <h3>{game.youtube_title || "YouTube gameplay"}</h3>
                    <p>{game.youtube_channel || "YouTube creator"}</p>
                  </div>
                  {game.youtube_view_count !== null && (
                    <span>
                      {new Intl.NumberFormat("en").format(
                        game.youtube_view_count,
                      )}{" "}
                      views
                    </span>
                  )}
                </div>
                {game.youtube_summary_positive && (
                  <YoutubePoint
                    className="positive"
                    symbol="+"
                    title="What the creator liked"
                    text={game.youtube_summary_positive}
                  />
                )}
                {game.youtube_summary_negative && (
                  <YoutubePoint
                    className="negative"
                    symbol="−"
                    title="What the creator disliked"
                    text={game.youtube_summary_negative}
                  />
                )}
                {game.youtube_summary_conclusion && (
                  <YoutubePoint
                    className="conclusion"
                    symbol="→"
                    title="Conclusion"
                    text={game.youtube_summary_conclusion}
                  />
                )}
                <a
                  className="primary-link youtube-link"
                  href={game.youtube_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Watch on YouTube →
                </a>
              </div>
            </section>
          )}

        {similar.length > 0 && (
          <section className="detail-section">
            <div className="section-heading">
              <p className="eyebrow">From this library</p>
              <h2>Similar games</h2>
            </div>
            <div className="similar-grid">
              {similar.map((item) => (
                <Link href={`/game/${item.slug}`} key={item.id}>
                  <div className="similar-cover">
                    {item.cover_url ? (
                      <Image
                        src={item.cover_url}
                        alt=""
                        fill
                        sizes="160px"
                      />
                    ) : (
                      <span>No cover</span>
                    )}
                  </div>
                  <strong>{item.title}</strong>
                  <span>Metascore {item.maxMetascore ?? "—"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </main>
  );
}

function YoutubePoint({
  className,
  symbol,
  title,
  text,
}: {
  className: string;
  symbol: string;
  title: string;
  text: string;
}) {
  return (
    <div className={`summary-point ${className}`}>
      <span>{symbol}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  positive,
  negative,
}: {
  title: string;
  positive: string | null;
  negative: string | null;
}) {
  return (
    <div className="summary-card">
      <h3>{title}</h3>
      <div className="summary-point positive">
        <span>+</span>
        <div>
          <strong>What works</strong>
          <p>{positive || "Not enough reviews for a reliable summary."}</p>
        </div>
      </div>
      <div className="summary-point negative">
        <span>−</span>
        <div>
          <strong>What doesn’t</strong>
          <p>{negative || "Not enough reviews for a reliable summary."}</p>
        </div>
      </div>
    </div>
  );
}
