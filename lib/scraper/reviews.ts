import "server-only";

type ReviewKind = "critic" | "user";

type ReviewItem = {
  id?: string;
  quote?: string;
};

type ReviewPage = {
  data?: {
    items?: ReviewItem[];
  };
  links?: {
    next?: {
      href?: string | null;
    };
  };
};

const API_ORIGIN = "https://backend.metacritic.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

function firstPageUrl(
  slug: string,
  platformSlug: string,
  kind: ReviewKind,
) {
  const url = new URL(
    `/reviews/metacritic/${kind}/games/${slug}/platform/${platformSlug}/web`,
    API_ORIGIN,
  );
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "50");
  url.searchParams.set("filterBySentiment", "all");
  url.searchParams.set("sort", kind === "critic" ? "score" : "date");
  url.searchParams.set("componentName", `${kind}-reviews`);
  url.searchParams.set("componentDisplayName", `${kind} Reviews`);
  url.searchParams.set("componentType", "ReviewList");
  return url.toString();
}

async function fetchReviewPage(url: string): Promise<ReviewPage> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Metacritic reviews API returned HTTP ${response.status}`);
  }
  return response.json() as Promise<ReviewPage>;
}

async function collectGroup(
  slug: string,
  platformSlugs: string[],
  kind: ReviewKind,
) {
  const reviews = new Map<string, string>();

  for (const platformSlug of platformSlugs) {
    let nextUrl: string | null = firstPageUrl(slug, platformSlug, kind);
    const visited = new Set<string>();

    while (nextUrl && !visited.has(nextUrl)) {
      visited.add(nextUrl);
      try {
        const page = await fetchReviewPage(nextUrl);
        for (const item of page.data?.items ?? []) {
          const quote = item.quote?.replace(/\s+/g, " ").trim();
          if (!quote || quote.length < 30) continue;
          reviews.set(item.id || quote, quote);
        }
        nextUrl = page.links?.next?.href || null;
        if (nextUrl) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch (error) {
        console.warn(
          `Could not collect ${kind} reviews for ${slug}/${platformSlug}`,
          error,
        );
        break;
      }
    }
  }

  return [...reviews.values()];
}

export async function collectAllReviews(
  slug: string,
  platformSlugs: string[],
) {
  const uniquePlatforms = [...new Set(platformSlugs.filter(Boolean))];
  const criticReviews = await collectGroup(slug, uniquePlatforms, "critic");
  const userReviews = await collectGroup(slug, uniquePlatforms, "user");
  return { criticReviews, userReviews };
}
