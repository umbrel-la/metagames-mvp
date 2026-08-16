import "server-only";

import { Supadata, type Transcript, type YoutubeSearchVideoResult } from "@supadata/js";
import OpenAI from "openai";
import { z } from "zod";
import type { YoutubeAnalysisRecord } from "@/lib/db";

const youtubeSummarySchema = z.object({
  positive: z.string().max(700).nullable(),
  negative: z.string().max(700).nullable(),
  conclusion: z.string().max(700).nullable(),
});

const GAMEPLAY_TITLE =
  /\b(gameplay|walkthrough|let'?s play|lets play|playthrough|full game|longplay)\b/i;
const EXCLUDED_TITLE =
  /\b(shorts?|trailer|teaser|soundtrack|ost|music video|review|reaction|no commentary)\b/i;
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 3_000;
const MAX_TRANSCRIPT_CHARS = 300_000;

export type YoutubeSearchCandidate = {
  id: string;
  title: string;
  channel: string;
  viewCount: number;
  duration: number;
};

export type YoutubeAnalysisDiagnostics = {
  query: string;
  searchResults: YoutubeSearchCandidate[];
  selected: YoutubeSearchCandidate;
  transcriptLength: number;
  supadataRequests: number;
  openAiRequests: number;
};

export type YoutubeAnalysisResult = {
  analysis: YoutubeAnalysisRecord;
  diagnostics: YoutubeAnalysisDiagnostics;
};

const normalize = (value: string | null) => value?.trim() || null;

function transcriptText(transcript: Transcript) {
  if (typeof transcript.content === "string") return transcript.content.trim();
  return transcript.content
    .map((chunk) => chunk.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function transcriptForPrompt(transcript: string) {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) return transcript;
  const half = MAX_TRANSCRIPT_CHARS / 2;
  return `${transcript.slice(0, half)}\n\n[...]\n\n${transcript.slice(-half)}`;
}

function candidate(video: YoutubeSearchVideoResult): YoutubeSearchCandidate {
  return {
    id: video.id,
    title: video.title,
    channel: video.channel.name,
    viewCount: video.viewCount,
    duration: video.duration,
  };
}

function normalizedTitle(value: string) {
  return value
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function resolveTranscript(
  supadata: Supadata,
  youtubeUrl: string,
  incrementRequest: () => void,
) {
  incrementRequest();
  const initial = await supadata.transcript({
    url: youtubeUrl,
    text: true,
    mode: "auto",
  });
  if (!("jobId" in initial)) return transcriptText(initial);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    incrementRequest();
    const job = await supadata.transcript.getJobStatus(initial.jobId);
    if (job.status === "completed" && job.result) {
      return transcriptText(job.result);
    }
    if (job.status === "failed") {
      throw new Error(job.error?.message || "Supadata transcription failed");
    }
  }
  throw new Error("Supadata transcription timed out");
}

export async function analyzeYoutubeGameplay(
  gameTitle: string,
): Promise<YoutubeAnalysisResult> {
  if (!process.env.SUPADATA_API_KEY) {
    throw new Error("SUPADATA_API_KEY is not configured");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const supadata = new Supadata({ apiKey: process.env.SUPADATA_API_KEY });
  const query = `"${gameTitle}" gameplay walkthrough`;
  const normalizedGameTitle = normalizedTitle(gameTitle);
  let supadataRequests = 0;
  let openAiRequests = 0;

  supadataRequests += 1;
  const search = await supadata.youtube.search({
    query,
    type: "video",
    sortBy: "views",
    duration: "long",
    limit: 50,
  });
  const videos = search.results.filter(
    (result): result is YoutubeSearchVideoResult => result.type === "video",
  );
  const suitable = videos
    .filter(
      (video) =>
        normalizedTitle(video.title).includes(normalizedGameTitle) &&
        !EXCLUDED_TITLE.test(video.title) &&
        (GAMEPLAY_TITLE.test(video.title) ||
          /\b(gaming|games)\b/i.test(video.channel.name)),
    )
    .sort((a, b) => b.viewCount - a.viewCount);
  const selectedVideo = suitable[0];
  if (!selectedVideo) {
    throw new Error(`No suitable gameplay video found for ${gameTitle}`);
  }

  const selected = candidate(selectedVideo);
  const youtubeUrl = `https://www.youtube.com/watch?v=${selected.id}`;
  const transcript = await resolveTranscript(
    supadata,
    youtubeUrl,
    () => {
      supadataRequests += 1;
    },
  );
  if (!transcript) throw new Error("Supadata returned an empty transcript");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  openAiRequests += 1;
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "Analyze only the supplied YouTube gameplay transcript and identify the video author's own " +
          "opinion. Do not invent a review or treat the game's events and dialogue as the author's views. " +
          "Use concrete aspects such as gameplay, combat, exploration, story, performance, controls, " +
          "graphics, sound, pacing, or difficulty. Avoid promotional and vague language. Return valid JSON " +
          "only: {\"positive\":string|null,\"negative\":string|null,\"conclusion\":string|null}. " +
          "Each value must be concise Russian in the third person (for example, «Автор хвалит…»), no more " +
          "than two sentences. Never speak as the author using «я». Return null when the author does not " +
          "express a clear corresponding opinion.",
      },
      {
        role: "user",
        content:
          `GAME: ${gameTitle}\nVIDEO: ${selected.title}\nCHANNEL: ${selected.channel}\n\n` +
          `TRANSCRIPT:\n${transcriptForPrompt(transcript)}`,
      },
    ],
  });

  const json = response.output_text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "");
  const summary = youtubeSummarySchema.parse(JSON.parse(json));

  return {
    analysis: {
      url: youtubeUrl,
      title: selected.title,
      channel: selected.channel,
      viewCount: selected.viewCount,
      positive: normalize(summary.positive),
      negative: normalize(summary.negative),
      conclusion: normalize(summary.conclusion),
    },
    diagnostics: {
      query,
      searchResults: videos.slice(0, 5).map(candidate),
      selected,
      transcriptLength: transcript.length,
      supadataRequests,
      openAiRequests,
    },
  };
}
