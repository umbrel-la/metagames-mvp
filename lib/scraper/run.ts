import "server-only";

import { SupadataError } from "@supadata/js";
import {
  createScrapeRun,
  failScrapeRun,
  finishScrapeRun,
  hasYoutubeAnalysis,
  initializeScrapeProgress,
  isProcessedToday,
  markProcessedToday,
  recordScrapeItemResult,
  saveYoutubeAnalysis,
  setScrapeCurrentGame,
  type ScrapePlan,
  upsertGame,
} from "@/lib/db";
import {
  analyzeGameReviews,
  type GameReviewAnalysis,
} from "@/lib/openai/summaries";
import { analyzeYoutubeGameplay } from "@/lib/youtube/analysis";
import { scrapeGameDetails } from "./game-details";
import { scrapeBrowseNew, scrapeNewReleases } from "./metacritic";

const emptyAnalysis = (): GameReviewAnalysis => ({
  critics: { positive: null, negative: null },
  users: { positive: null, negative: null },
});

async function safeAnalysis(
  title: string,
  criticReviews: string[],
  userReviews: string[],
) {
  try {
    return await analyzeGameReviews(title, criticReviews, userReviews);
  } catch (error) {
    console.error(`OpenAI combined analysis failed for ${title}`, error);
    return emptyAnalysis();
  }
}

async function safeYoutubeAnalysis(slug: string, title: string) {
  if (await hasYoutubeAnalysis(slug)) return;
  try {
    const result = await analyzeYoutubeGameplay(title);
    await saveYoutubeAnalysis(slug, result.analysis);
  } catch (error) {
    console.error(`YouTube analysis failed for ${title}`, error);
    if (
      (error instanceof SupadataError &&
        (error.error === "limit-exceeded" ||
          error.error === "upgrade-required")) ||
      (error instanceof Error && /\b(?:402|429)\b/.test(error.message))
    ) {
      return "SUPADATA_QUOTA_EXHAUSTED" as const;
    }
  }
}

export async function reserveScrapeRun() {
  const date = new Date().toISOString().slice(0, 10);
  return createScrapeRun(date);
}

export async function runScrape(reservedPlan?: ScrapePlan) {
  const plan = reservedPlan ?? (await reserveScrapeRun());
  const { date } = plan;
  let processed = 0;
  let failed = 0;
  let skipYoutubeForRun = false;
  const errors: { slug: string; error: string }[] = [];

  try {
    const list =
      plan.source === "NEW_RELEASES"
        ? await scrapeNewReleases()
        : await scrapeBrowseNew(plan.page);
    const pending = [];
    for (const item of list) {
      if (!(await isProcessedToday(date, item.slug))) pending.push(item);
    }
    await initializeScrapeProgress(plan.runId, pending.length);

    for (const item of pending) {
      await setScrapeCurrentGame(plan.runId, item.title);
      try {
        const game = await scrapeGameDetails(
          item.slug,
          item.url,
          item.coverUrl,
        );
        const analysis = await safeAnalysis(
          game.title,
          game.criticReviews,
          game.userReviews,
        );
        await upsertGame(game, {
          criticPositive: analysis.critics.positive,
          criticNegative: analysis.critics.negative,
          userPositive: analysis.users.positive,
          userNegative: analysis.users.negative,
        });
        if (!skipYoutubeForRun) {
          const youtubeResult = await safeYoutubeAnalysis(item.slug, game.title);
          if (youtubeResult === "SUPADATA_QUOTA_EXHAUSTED") {
            skipYoutubeForRun = true;
            console.warn(
              "Supadata quota is exhausted; skipping YouTube analysis for the rest of this run",
            );
          }
        }
        await markProcessedToday(date, item.slug);
        processed += 1;
        await recordScrapeItemResult(plan.runId, true);
      } catch (error) {
        failed += 1;
        const message =
          error instanceof Error ? error.message : "Unknown scraper error";
        errors.push({ slug: item.slug, error: message });
        console.error(`Failed to process ${item.slug}`, error);
        await recordScrapeItemResult(plan.runId, false, message);
      }
    }

    await finishScrapeRun(plan.runId);
    return {
      ok: true,
      date,
      source: plan.source,
      page: plan.page,
      processed,
      failed,
      errors,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scrape run error";
    await failScrapeRun(plan.runId, message);
    throw error;
  }
}
