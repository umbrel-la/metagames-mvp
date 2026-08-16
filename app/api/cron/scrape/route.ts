import { NextRequest, NextResponse } from "next/server";
import { runScrape } from "@/lib/scraper/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
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
    return NextResponse.json(await runScrape());
  } catch (error) {
    console.error("Scrape run failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown scrape run error",
      },
      { status: 500 },
    );
  }
}
