"use server";

import { headers } from "next/headers";

export type RunActionState = {
  started: boolean;
  message: string | null;
  requestId: number;
};

export async function startScrapeAction(
  previousState: RunActionState,
): Promise<RunActionState> {
  void previousState;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return {
      started: false,
      message: "CRON_SECRET is not configured",
      requestId: Date.now(),
    };
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  if (!host) {
    return {
      started: false,
      message: "Could not determine the application URL",
      requestId: Date.now(),
    };
  }
  const protocol =
    requestHeaders.get("x-forwarded-proto")?.split(",")[0] ||
    (host.startsWith("localhost") ? "http" : "https");

  try {
    const response = await fetch(`${protocol}://${host}/api/admin/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const result = (await response.json()) as {
      started?: boolean;
      error?: string;
    };
    return {
      started: response.ok && result.started === true,
      message: response.ok
        ? "Scraper started"
        : result.error || "Could not start scraper",
      requestId: Date.now(),
    };
  } catch (error) {
    console.error("Dashboard could not start scraper", error);
    return {
      started: false,
      message: "Could not start scraper",
      requestId: Date.now(),
    };
  }
}
