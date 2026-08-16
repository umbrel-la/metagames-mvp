import "server-only";

import { createClient, type Client, type InStatement } from "@libsql/client";
import type {
  GameRecord,
  PlatformScore,
  ScrapedGame,
  ScrapeRunStatus,
  ScrapeStatusResponse,
} from "@/lib/types";

let client: Client | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

export function getDb() {
  if (!process.env.TURSO_DATABASE_URL) {
    throw new Error("TURSO_DATABASE_URL is not configured");
  }

  client ??= createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return client;
}

const numberOrNull = (value: unknown) =>
  value === null || value === undefined ? null : Number(value);

function mapPlatforms(rows: Record<string, unknown>[]): PlatformScore[] {
  return rows.map((row) => ({
    platform: String(row.platform),
    platformSlug: row.platform_slug ? String(row.platform_slug) : null,
    metascore: numberOrNull(row.metascore),
    userscore: numberOrNull(row.userscore),
  }));
}

export async function listGames(): Promise<GameRecord[]> {
  if (!isDatabaseConfigured()) return [];

  const db = getDb();
  const [gamesResult, platformsResult] = await Promise.all([
    db.execute("SELECT * FROM games ORDER BY updated_at DESC"),
    db.execute(
      "SELECT game_id, platform, platform_slug, metascore, userscore FROM game_platforms ORDER BY platform",
    ),
  ]);

  const platformsByGame = new Map<number, PlatformScore[]>();
  for (const row of platformsResult.rows) {
    const gameId = Number(row.game_id);
    const items = platformsByGame.get(gameId) ?? [];
    items.push(...mapPlatforms([row]));
    platformsByGame.set(gameId, items);
  }

  return gamesResult.rows.map((row) => {
    const platforms = platformsByGame.get(Number(row.id)) ?? [];
    const scores = platforms
      .map((platform) => platform.metascore)
      .filter((score): score is number => score !== null);
    return {
      ...(row as unknown as Omit<GameRecord, "platforms" | "maxMetascore">),
      id: Number(row.id),
      youtube_view_count: numberOrNull(row.youtube_view_count),
      platforms,
      maxMetascore: scores.length ? Math.max(...scores) : null,
    };
  });
}

export async function getGameBySlug(slug: string) {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  const gameResult = await db.execute({
    sql: "SELECT * FROM games WHERE slug = ? LIMIT 1",
    args: [slug],
  });
  const row = gameResult.rows[0];
  if (!row) return null;

  const platformResult = await db.execute({
    sql: `SELECT platform, platform_slug, metascore, userscore
          FROM game_platforms WHERE game_id = ? ORDER BY platform`,
    args: [row.id],
  });
  const platforms = mapPlatforms(platformResult.rows);
  const scores = platforms
    .map((platform) => platform.metascore)
    .filter((score): score is number => score !== null);

  return {
    ...(row as unknown as Omit<GameRecord, "platforms" | "maxMetascore">),
    id: Number(row.id),
    youtube_view_count: numberOrNull(row.youtube_view_count),
    platforms,
    maxMetascore: scores.length ? Math.max(...scores) : null,
  } satisfies GameRecord;
}

type Summaries = {
  criticPositive: string | null;
  criticNegative: string | null;
  userPositive: string | null;
  userNegative: string | null;
};

export async function upsertGame(game: ScrapedGame, summaries: Summaries) {
  const db = getDb();
  const statements: InStatement[] = [
    {
      sql: `INSERT INTO games (
              slug, title, cover_url, developer, description, video_url,
              metacritic_url, genres, critic_summary_positive,
              critic_summary_negative, user_summary_positive, user_summary_negative
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
              title = excluded.title,
              cover_url = excluded.cover_url,
              developer = excluded.developer,
              description = excluded.description,
              video_url = excluded.video_url,
              metacritic_url = excluded.metacritic_url,
              genres = excluded.genres,
              critic_summary_positive = excluded.critic_summary_positive,
              critic_summary_negative = excluded.critic_summary_negative,
              user_summary_positive = excluded.user_summary_positive,
              user_summary_negative = excluded.user_summary_negative,
              updated_at = CURRENT_TIMESTAMP`,
      args: [
        game.slug,
        game.title,
        game.coverUrl,
        game.developer,
        game.description,
        game.videoUrl,
        game.metacriticUrl,
        JSON.stringify(game.genres),
        summaries.criticPositive,
        summaries.criticNegative,
        summaries.userPositive,
        summaries.userNegative,
      ],
    },
  ];

  await db.batch(statements, "write");
  const gameRow = await db.execute({
    sql: "SELECT id FROM games WHERE slug = ?",
    args: [game.slug],
  });
  const gameId = Number(gameRow.rows[0].id);

  await db.batch(
    [
      {
        sql: "DELETE FROM game_platforms WHERE game_id = ?",
        args: [gameId],
      },
      ...game.platforms.map((platform) => ({
      sql: `INSERT INTO game_platforms (
              game_id, platform, platform_slug, metascore, userscore
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(game_id, platform) DO UPDATE SET
              platform_slug = excluded.platform_slug,
              metascore = excluded.metascore,
              userscore = excluded.userscore,
              updated_at = CURRENT_TIMESTAMP`,
      args: [
        gameId,
        platform.platform,
        platform.platformSlug,
        platform.metascore,
        platform.userscore,
      ],
      })),
    ],
    "write",
  );
}

export type YoutubeAnalysisRecord = {
  url: string;
  title: string;
  channel: string;
  viewCount: number;
  positive: string | null;
  negative: string | null;
  conclusion: string | null;
};

export async function hasYoutubeAnalysis(slug: string) {
  const result = await getDb().execute({
    sql: `SELECT 1 FROM games
          WHERE slug = ? AND youtube_analyzed_at IS NOT NULL
          LIMIT 1`,
    args: [slug],
  });
  return result.rows.length > 0;
}

export async function saveYoutubeAnalysis(
  slug: string,
  analysis: YoutubeAnalysisRecord,
) {
  await getDb().execute({
    sql: `UPDATE games SET
            youtube_url = ?,
            youtube_title = ?,
            youtube_channel = ?,
            youtube_view_count = ?,
            youtube_summary_positive = ?,
            youtube_summary_negative = ?,
            youtube_summary_conclusion = ?,
            youtube_analyzed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE slug = ?`,
    args: [
      analysis.url,
      analysis.title,
      analysis.channel,
      analysis.viewCount,
      analysis.positive,
      analysis.negative,
      analysis.conclusion,
      slug,
    ],
  });
}

export type ScrapePlan = {
  runId: number;
  date: string;
  source: "NEW_RELEASES" | "BROWSE_NEW";
  page: number;
};

export async function createScrapeRun(date: string): Promise<ScrapePlan> {
  const db = getDb();
  await db.execute({
    sql: `UPDATE scrape_runs SET status = 'FAILED',
          error = 'Run timed out before completion',
          error_message = 'Run timed out before completion',
          current_game = NULL,
          finished_at = CURRENT_TIMESTAMP
          WHERE status = 'RUNNING'
            AND started_at <= datetime('now', '-55 minutes')`,
    args: [],
  });
  const active = await db.execute({
    sql: `SELECT id FROM scrape_runs
          WHERE status = 'RUNNING'
            AND started_at > datetime('now', '-55 minutes')
          LIMIT 1`,
    args: [],
  });
  if (active.rows.length) {
    throw new Error("A scrape run is already in progress");
  }

  const completed = await db.execute({
    sql: `SELECT source, page FROM scrape_runs
          WHERE date = ? AND status = 'COMPLETED'
          ORDER BY id`,
    args: [date],
  });
  const hasNewReleases = completed.rows.some(
    (row) => String(row.source) === "NEW_RELEASES",
  );
  const browsePages = completed.rows
    .filter((row) => String(row.source) === "BROWSE_NEW")
    .map((row) => Number(row.page));
  const source = hasNewReleases ? "BROWSE_NEW" : "NEW_RELEASES";
  const page = source === "BROWSE_NEW" ? Math.max(0, ...browsePages) + 1 : 0;

  let result;
  try {
    result = await db.execute({
      sql: `INSERT INTO scrape_runs (date, source, page, status)
            VALUES (?, ?, ?, 'RUNNING')`,
      args: [date, source, page],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("unique")
    ) {
      throw new Error("A scrape run is already in progress");
    }
    throw error;
  }
  return { runId: Number(result.lastInsertRowid), date, source, page };
}

export async function isProcessedToday(date: string, slug: string) {
  const result = await getDb().execute({
    sql: "SELECT 1 FROM daily_processed_games WHERE date = ? AND slug = ?",
    args: [date, slug],
  });
  return result.rows.length > 0;
}

export async function markProcessedToday(date: string, slug: string) {
  await getDb().execute({
    sql: `INSERT INTO daily_processed_games (date, slug)
          VALUES (?, ?) ON CONFLICT(date, slug) DO NOTHING`,
    args: [date, slug],
  });
}

export async function initializeScrapeProgress(
  runId: number,
  totalCount: number,
) {
  await getDb().execute({
    sql: `UPDATE scrape_runs SET total_count = ?, processed_count = 0,
          success_count = 0, failed_count = 0, current_game = NULL,
          error_message = NULL, error = NULL
          WHERE id = ? AND status = 'RUNNING'`,
    args: [totalCount, runId],
  });
}

export async function setScrapeCurrentGame(runId: number, title: string) {
  await getDb().execute({
    sql: `UPDATE scrape_runs SET current_game = ?
          WHERE id = ? AND status = 'RUNNING'`,
    args: [title.slice(0, 500), runId],
  });
}

export async function recordScrapeItemResult(
  runId: number,
  succeeded: boolean,
  errorMessage: string | null = null,
) {
  await getDb().execute({
    sql: `UPDATE scrape_runs SET
            processed_count = processed_count + 1,
            success_count = success_count + ?,
            failed_count = failed_count + ?,
            error_message = CASE WHEN ? IS NULL THEN error_message ELSE ? END
          WHERE id = ? AND status = 'RUNNING'`,
    args: [
      succeeded ? 1 : 0,
      succeeded ? 0 : 1,
      errorMessage,
      errorMessage?.slice(0, 2000) ?? null,
      runId,
    ],
  });
}

export async function finishScrapeRun(runId: number) {
  await getDb().execute({
    sql: `UPDATE scrape_runs SET status = 'COMPLETED', current_game = NULL,
          finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [runId],
  });
}

export async function failScrapeRun(runId: number, error: string) {
  const message = error.slice(0, 2000);
  await getDb().execute({
    sql: `UPDATE scrape_runs SET status = 'FAILED', error = ?,
          error_message = ?, current_game = NULL,
          finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
    args: [message, message, runId],
  });
}

function mapScrapeRun(row: Record<string, unknown>): ScrapeRunStatus {
  const databaseStatus = String(row.status);
  const processedCount = Number(row.processed_count ?? 0);
  const failedCount = Number(row.failed_count ?? 0);
  const storedTotal = Number(row.total_count ?? 0);
  const storedSuccess = Number(row.success_count ?? 0);
  const isLegacyRun = storedTotal === 0 && processedCount > 0;
  const legacyTotal = processedCount + failedCount;
  return {
    id: Number(row.id),
    status:
      databaseStatus === "RUNNING"
        ? "RUNNING"
        : databaseStatus === "COMPLETED"
          ? "SUCCESS"
          : "ERROR",
    source: String(row.source) as ScrapeRunStatus["source"],
    page: String(row.source) === "BROWSE_NEW" ? Number(row.page) : null,
    totalCount: isLegacyRun ? legacyTotal : storedTotal,
    processedCount: isLegacyRun ? legacyTotal : processedCount,
    successCount: isLegacyRun ? processedCount : storedSuccess,
    failedCount,
    currentGame: row.current_game ? String(row.current_game) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    errorMessage:
      row.error_message || row.error
        ? String(row.error_message || row.error)
        : null,
  };
}

export async function getScrapeStatus(): Promise<ScrapeStatusResponse> {
  const db = getDb();
  const [latestResult, historyResult] = await Promise.all([
    db.execute("SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 1"),
    db.execute("SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 5"),
  ]);
  const history = historyResult.rows.map((row) => mapScrapeRun(row));
  const latest = latestResult.rows[0];
  if (!latest) {
    return {
      id: null,
      status: "IDLE",
      source: null,
      page: null,
      totalCount: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      currentGame: null,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      history,
    };
  }
  return { ...mapScrapeRun(latest), history };
}
