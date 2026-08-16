import "server-only";

import { listGames } from "@/lib/db";
import type { GameRecord } from "@/lib/types";

const words = (value: string | null) =>
  new Set(
    (value ?? "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]{4,}/gu)
      ?.slice(0, 80) ?? [],
  );

const parseGenres = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

function similarityScore(target: GameRecord, candidate: GameRecord) {
  let score = 0;
  if (
    target.developer &&
    candidate.developer &&
    target.developer.toLowerCase() === candidate.developer.toLowerCase()
  ) {
    score += 6;
  }

  const targetPlatforms = new Set(
    target.platforms.map((item) => item.platform.toLowerCase()),
  );
  score += candidate.platforms.filter((item) =>
    targetPlatforms.has(item.platform.toLowerCase()),
  ).length;

  const targetGenres = new Set(
    parseGenres(target.genres).map((genre) => genre.toLowerCase()),
  );
  score +=
    parseGenres(candidate.genres).filter((genre) =>
      targetGenres.has(genre.toLowerCase()),
    ).length * 3;

  const targetWords = words(target.description);
  const overlap = [...words(candidate.description)].filter((word) =>
    targetWords.has(word),
  ).length;
  score += Math.min(overlap, 5) * 0.4;
  return score;
}

export async function getSimilarGames(target: GameRecord, limit = 4) {
  const games = await listGames();
  return games
    .filter((game) => game.id !== target.id)
    .map((game) => ({ game, score: similarityScore(target, game) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.game.maxMetascore ?? -1) - (a.game.maxMetascore ?? -1),
    )
    .slice(0, limit)
    .map(({ game }) => game);
}
