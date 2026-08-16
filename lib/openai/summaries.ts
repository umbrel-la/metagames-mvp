import "server-only";

import OpenAI from "openai";
import { z } from "zod";

const groupSchema = z.object({
  positive: z.string().max(700).nullable(),
  negative: z.string().max(700).nullable(),
});

const analysisSchema = z.object({
  critics: groupSchema,
  users: groupSchema,
});

export type ReviewSummary = {
  positive: string | null;
  negative: string | null;
};

export type GameReviewAnalysis = {
  critics: ReviewSummary;
  users: ReviewSummary;
};

const emptyAnalysis = (): GameReviewAnalysis => ({
  critics: { positive: null, negative: null },
  users: { positive: null, negative: null },
});

const formatReviews = (reviews: string[]) =>
  reviews.map((review, index) => `${index + 1}. ${review}`).join("\n\n");

const normalizeGroup = (
  summary: ReviewSummary,
  reviewCount: number,
): ReviewSummary => {
  if (reviewCount < 3) return { positive: null, negative: null };
  return {
    positive: summary.positive?.trim() || null,
    negative: summary.negative?.trim() || null,
  };
};

export async function analyzeGameReviews(
  title: string,
  criticReviews: string[],
  userReviews: string[],
): Promise<GameReviewAnalysis> {
  if (
    !process.env.OPENAI_API_KEY ||
    (criticReviews.length === 0 && userReviews.length === 0)
  ) {
    return emptyAnalysis();
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "Analyze only the supplied reviews; never use outside knowledge or the game description. " +
          "Keep CRITIC REVIEWS and USER REVIEWS completely separate. Find concrete themes repeated " +
          "across multiple reviews and prioritize the most frequent opinions. Focus on specific causes: " +
          "gameplay, combat, exploration, controls, performance, optimization, bugs, story, characters, " +
          "graphics, art style, sound, music, pacing, difficulty, multiplayer, co-op, progression, level " +
          "design, content amount, replayability, or another repeatedly discussed aspect. Do not build a " +
          "summary around one isolated comment. Avoid advertising language and vague phrases such as " +
          "\"fun and engaging\", \"interesting experience\", or \"players like the game\". Each non-null " +
          "value must be concise Russian, one or two sentences, and state concrete reasons. If a group has " +
          "fewer than three substantive reviews, return null for both values in that group. Return valid " +
          "JSON only in exactly this shape: " +
          "{\"critics\":{\"positive\":string|null,\"negative\":string|null}," +
          "\"users\":{\"positive\":string|null,\"negative\":string|null}}.",
      },
      {
        role: "user",
        content:
          `GAME:\n${title}\n\n` +
          `CRITIC REVIEWS (${criticReviews.length}):\n` +
          `${formatReviews(criticReviews) || "(empty)"}\n\n` +
          `USER REVIEWS (${userReviews.length}):\n` +
          `${formatReviews(userReviews) || "(empty)"}`,
      },
    ],
  });

  try {
    const json = response.output_text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/, "");
    const parsed = analysisSchema.parse(JSON.parse(json));
    return {
      critics: normalizeGroup(parsed.critics, criticReviews.length),
      users: normalizeGroup(parsed.users, userReviews.length),
    };
  } catch (error) {
    console.warn("OpenAI returned an invalid combined review analysis", error);
    return emptyAnalysis();
  }
}
