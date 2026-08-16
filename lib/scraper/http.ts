import "server-only";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

export async function fetchHtml(url: string, timeoutMs = 20_000) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Metacritic returned HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  if (html.length < 10_000) {
    throw new Error(`Metacritic returned an unexpectedly short page for ${url}`);
  }
  return html;
}
