import { NextResponse } from "next/server";
import { getScrapeStatus } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getScrapeStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not read scraper status", error);
    return NextResponse.json(
      { error: "Could not read scraper status" },
      { status: 500 },
    );
  }
}
