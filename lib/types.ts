export type PlatformScore = {
  platform: string;
  platformSlug: string | null;
  metascore: number | null;
  userscore: number | null;
};

export type ScrapedGame = {
  slug: string;
  title: string;
  coverUrl: string | null;
  developer: string | null;
  description: string | null;
  videoUrl: string | null;
  metacriticUrl: string;
  genres: string[];
  platforms: PlatformScore[];
  criticReviews: string[];
  userReviews: string[];
};

export type GameRecord = {
  id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  developer: string | null;
  description: string | null;
  video_url: string | null;
  metacritic_url: string;
  genres: string;
  critic_summary_positive: string | null;
  critic_summary_negative: string | null;
  user_summary_positive: string | null;
  user_summary_negative: string | null;
  youtube_url: string | null;
  youtube_title: string | null;
  youtube_channel: string | null;
  youtube_view_count: number | null;
  youtube_summary_positive: string | null;
  youtube_summary_negative: string | null;
  youtube_summary_conclusion: string | null;
  youtube_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
  platforms: PlatformScore[];
  maxMetascore: number | null;
};

export type ScrapeMonitorStatus = "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";

export type ScrapeRunStatus = {
  id: number | null;
  status: ScrapeMonitorStatus;
  source: "NEW_RELEASES" | "BROWSE_NEW" | null;
  page: number | null;
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  currentGame: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
};

export type ScrapeStatusResponse = ScrapeRunStatus & {
  history: ScrapeRunStatus[];
};
