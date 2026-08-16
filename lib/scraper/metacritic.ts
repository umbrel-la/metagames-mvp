import "server-only";

import { load } from "cheerio";
import { fetchHtml } from "./http";

const ORIGIN = "https://www.metacritic.com";

export type GameListItem = {
  slug: string;
  title: string;
  url: string;
  coverUrl: string | null;
};

function itemFromLink(
  href: string | undefined,
  title: string,
  coverUrl: string | undefined,
) {
  if (!href) return null;
  const match = href.match(/^\/game\/([^/]+)\/?/);
  if (!match || !title) return null;
  return {
    slug: match[1],
    title,
    url: new URL(href, ORIGIN).toString(),
    coverUrl: coverUrl ? new URL(coverUrl, ORIGIN).toString() : null,
  };
}

export async function scrapeNewReleases(): Promise<GameListItem[]> {
  const html = await fetchHtml(`${ORIGIN}/game/`);
  const $ = load(html);
  const items: GameListItem[] = [];

  $(
    '[data-testid="new-game-release-carousel"] [data-testid="product-card-content"]',
  ).each((_, element) => {
    const link = $(element);
    const item = itemFromLink(
      link.attr("href"),
      link.find('[data-testid="product-card-title"]').first().text().trim(),
      link.find("img[src]").last().attr("src"),
    );
    if (item && !items.some((existing) => existing.slug === item.slug)) {
      items.push(item);
    }
  });

  if (!items.length) {
    throw new Error("New Releases markup was found without any game cards");
  }
  return items.slice(0, 20);
}

export async function scrapeBrowseNew(page: number): Promise<GameListItem[]> {
  const url = new URL(`${ORIGIN}/browse/game/all/all/all-time/new/`);
  url.searchParams.set("page", String(page));
  const html = await fetchHtml(url.toString());
  const $ = load(html);
  const items: GameListItem[] = [];

  $('[data-testid="product-title"]').each((_, titleElement) => {
    const title = $(titleElement).text().trim();
    const link = $(titleElement).closest('a[href^="/game/"]');
    const item = itemFromLink(
      link.attr("href"),
      title,
      link.find("img[src]").first().attr("src"),
    );
    if (item && !items.some((existing) => existing.slug === item.slug)) {
      items.push(item);
    }
  });

  if (!items.length) {
    throw new Error(`Browse New page ${page} did not contain game cards`);
  }
  return items.slice(0, 20);
}
