import { after, NextRequest, NextResponse } from "next/server";
import { reserveScrapeRun, runScrape } from "@/lib/scraper/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await reserveScrapeRun();
    after(async () => {
      try {
        await runScrape(plan);
      } catch (error) {
        console.error("Manual scrape run failed", error);
      }
    });
    return NextResponse.json(
      {
        started: true,
        runId: plan.runId,
        source: plan.source,
        page: plan.source === "BROWSE_NEW" ? plan.page : null,
      },
      { status: 202 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start scraper";
    if (message === "A scrape run is already in progress") {
      return NextResponse.json(
        { error: "Scraper is already running" },
        { status: 409 },
      );
    }
    console.error("Could not start manual scrape run", error);
    return NextResponse.json(
      { error: "Could not start scraper" },
      { status: 500 },
    );
  }
}
