import "server-only";

import { load, type CheerioAPI } from "cheerio";
import { parse } from "devalue";
import type { PlatformScore, ScrapedGame } from "@/lib/types";
import { fetchHtml } from "./http";
import { collectAllReviews } from "./reviews";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

function findProduct(value: unknown, slug: string): UnknownRecord | null {
  const seen = new Set<object>();
  let match: UnknownRecord | null = null;

  const walk = (candidate: unknown) => {
    if (match || candidate === null || typeof candidate !== "object") return;
    if (seen.has(candidate)) return;
    seen.add(candidate);

    const record = asRecord(candidate);
    if (
      record &&
      record.slug === slug &&
      record.type === "game-title" &&
      Array.isArray(record.platforms)
    ) {
      match = record;
      return;
    }

    const values = Array.isArray(candidate)
      ? candidate
      : Object.values(candidate as UnknownRecord);
    values.forEach(walk);
  };

  walk(value);
  return match;
}

function parseProduct($: CheerioAPI, slug: string) {
  const payload = $("#__NUXT_DATA__").text();
  if (!payload) return null;
  try {
    const passthrough = (value: unknown) => value;
    return findProduct(
      parse(payload, {
        ShallowReactive: passthrough,
        Reactive: passthrough,
        Ref: passthrough,
        ShallowRef: passthrough,
        EmptyRef: passthrough,
        EmptyShallowRef: passthrough,
        NuxtError: passthrough,
      }),
      slug,
    );
  } catch (error) {
    console.warn("Could not decode Metacritic Nuxt payload", error);
    return null;
  }
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseScore($: CheerioAPI, kind: "meta" | "user") {
  let value: number | null = null;
  $('[data-testid="product-hero"] [data-testid="product-score"]').each(
    (_, element) => {
      const block = $(element);
      const header = block
        .find('[data-testid="global-score-header"]')
        .first()
        .text()
        .trim()
        .toLowerCase();
      const isWanted =
        kind === "meta"
          ? header === "metascore"
          : header.includes("user score");
      if (!isWanted) return;
      const text = block
        .find(
          '[data-testid="global-score-value"], [data-testid="global-score-tbd"]',
        )
        .first()
        .text()
        .trim();
      value = text && text !== "tbd" ? nullableNumber(text) : null;
    },
  );
  return value;
}

function parseReviewPageScore($: CheerioAPI, kind: "meta" | "user") {
  const prefix = kind === "meta" ? "Metascore" : "User score";
  const score = $(`[title^="${prefix}"]`)
    .filter(
      (_, element) =>
        $(element).closest('[data-testid="review-card"]').length === 0,
    )
    .first()
    .attr("title");
  if (!score || /\b(tbd|null)\b/i.test(score)) return null;
  const match = score.match(/(\d+(?:\.\d+)?)/);
  return match ? nullableNumber(match[1]) : null;
}

function getCompany(product: UnknownRecord | null, typeName: string) {
  const production = asRecord(product?.production);
  const companies = Array.isArray(production?.companies)
    ? production.companies
    : [];
  const company = companies
    .map(asRecord)
    .find((item) => item?.typeName === typeName);
  return typeof company?.name === "string" ? company.name : null;
}

function getPayloadCover(product: UnknownRecord | null) {
  if (!Array.isArray(product?.images)) return null;
  const images = product.images
    .map(asRecord)
    .filter((image): image is UnknownRecord => Boolean(image));
  const image =
    images.find((item) => item.typeName === "cardImage") ??
    images.find((item) => item.typeName === "mainImage") ??
    images[0];
  if (typeof image?.imageUrl === "string" && image.imageUrl.startsWith("http")) {
    return image.imageUrl;
  }
  if (typeof image?.bucketPath === "string") {
    return new URL(`/a/img/catalog${image.bucketPath}`, metacriticOrigin).toString();
  }
  return null;
}

const metacriticOrigin = "https://www.metacritic.com";

function findVideoUrl(value: unknown): string | null {
  if (typeof value === "string") {
    if (/^https?:\/\/.+(youtube|youtu\.be|vimeo|\.mp4)/i.test(value)) {
      return value;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const nested of Object.values(value as UnknownRecord)) {
    const url = findVideoUrl(nested);
    if (url) return url;
  }
  return null;
}

function payloadPlatforms(product: UnknownRecord | null): PlatformScore[] {
  if (!Array.isArray(product?.platforms)) return [];
  return product.platforms
    .map(asRecord)
    .filter((item): item is UnknownRecord => Boolean(item?.name))
    .map((item) => {
      const critic = asRecord(item.criticScoreSummary);
      return {
        platform: String(item.name),
        platformSlug: typeof item.slug === "string" ? item.slug : null,
        metascore: nullableNumber(critic?.score),
        userscore: null,
      };
    });
}

function fallbackPlatforms($: CheerioAPI): PlatformScore[] {
  const platforms: PlatformScore[] = [];
  $('[data-testid="game-details"] .c-product-details__section').each(
    (_, element) => {
      const section = $(element);
      if (!section.find(".c-product-details__section__label").text().includes("Platforms")) {
        return;
      }
      section.find("li").each((__, item) => {
        const platform = $(item).text().trim();
        if (platform) {
          platforms.push({
            platform,
            platformSlug: null,
            metascore: null,
            userscore: null,
          });
        }
      });
    },
  );
  return platforms;
}

export async function scrapeGameDetails(
  slug: string,
  metacriticUrl: string,
  listingCoverUrl: string | null = null,
): Promise<ScrapedGame> {
  const html = await fetchHtml(metacriticUrl);
  const $ = load(html);
  const product = parseProduct($, slug);

  const title =
    (typeof product?.title === "string" ? product.title : null) ??
    $('[data-testid="hero-title"] h1').first().text().trim();
  if (!title) throw new Error(`Could not parse title for ${metacriticUrl}`);

  const description =
    (typeof product?.description === "string"
      ? product.description.trim()
      : null) ||
    $('[data-testid="hero-summary"]')
      .find("span")
      .filter((_, element) => $(element).text().trim() === "Summary")
      .first()
      .next()
      .text()
      .trim() ||
    null;
  const coverUrl =
    listingCoverUrl ??
    getPayloadCover(product) ??
    $('[data-testid="featured-image"] img').first().attr("src") ??
    null;
  const developer =
    getCompany(product, "Developer") ||
    $('[data-testid="hero-summary-developer"] p')
      .first()
      .text()
      .replace(/^Developer:\s*/i, "")
      .trim() ||
    null;
  const genres = Array.isArray(product?.genres)
    ? product.genres
        .map(asRecord)
        .map((genre) => genre?.name)
        .filter((name): name is string => typeof name === "string")
    : [];
  const platforms = payloadPlatforms(product);
  if (!platforms.length) platforms.push(...fallbackPlatforms($));

  const currentPlatform =
    typeof product?.platform === "string" ? product.platform : null;
  const basePlatform =
    platforms.find((item) => item.platform === currentPlatform) ?? platforms[0];
  if (basePlatform) {
    basePlatform.metascore = parseScore($, "meta") ?? basePlatform.metascore;
    basePlatform.userscore = parseScore($, "user");
  }

  const reviewPlatform = [...platforms]
    .filter((platform) => platform.platformSlug)
    .sort((a, b) => (b.metascore ?? -1) - (a.metascore ?? -1))[0];
  if (reviewPlatform?.platformSlug) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const criticUrl = new URL(
      `/game/${slug}/critic-reviews/`,
      metacriticUrl,
    );
    criticUrl.searchParams.set("platform", reviewPlatform.platformSlug);
    const criticPage = load(await fetchHtml(criticUrl.toString()));
    reviewPlatform.metascore =
      parseReviewPageScore(criticPage, "meta") ?? reviewPlatform.metascore;
  }

  for (const platform of platforms) {
    if (!platform.platformSlug) continue;
    await new Promise((resolve) => setTimeout(resolve, 250));
    const platformUrl = new URL(
      `/game/${slug}/user-reviews/`,
      metacriticUrl,
    );
    platformUrl.searchParams.set("platform", platform.platformSlug);
    const platformHtml = await fetchHtml(platformUrl.toString());
    const platformPage = load(platformHtml);
    platform.userscore = parseReviewPageScore(platformPage, "user");
  }

  const { criticReviews, userReviews } = await collectAllReviews(
    slug,
    platforms
      .map((platform) => platform.platformSlug)
      .filter((platformSlug): platformSlug is string => Boolean(platformSlug)),
  );

  return {
    slug,
    title,
    coverUrl,
    developer,
    description,
    videoUrl: findVideoUrl(product?.video),
    metacriticUrl,
    genres,
    platforms,
    criticReviews,
    userReviews,
  };
}
