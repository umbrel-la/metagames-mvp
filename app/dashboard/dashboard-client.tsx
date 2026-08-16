"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { ScrapeStatusResponse } from "@/lib/types";
import {
  startScrapeAction,
  type RunActionState,
} from "./actions";

const initialActionState: RunActionState = {
  started: false,
  message: null,
  requestId: 0,
};

function sourceLabel(
  source: ScrapeStatusResponse["source"],
  page: number | null,
) {
  if (source === "NEW_RELEASES") return "New Releases";
  if (source === "BROWSE_NEW") {
    return page === null ? "Browse New" : `Browse New · page ${page}`;
  }
  return "—";
}

function timeLabel(value: string | null) {
  if (!value) return "—";
  const normalized = value.replace("T", " ").replace(/\.\d+Z?$/, "");
  return `${normalized.slice(0, 16)} UTC`;
}

export function DashboardClient({
  initialStatus,
}: {
  initialStatus: ScrapeStatusResponse;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pollError, setPollError] = useState<string | null>(null);
  const [actionState, formAction, isPending] = useActionState(
    startScrapeAction,
    initialActionState,
  );

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Status request failed");
        const next = (await response.json()) as ScrapeStatusResponse;
        if (active) {
          setStatus(next);
          setPollError(null);
        }
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setPollError("Status is temporarily unavailable");
        }
      }
    };

    void poll();
    const interval = window.setInterval(poll, 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      controller?.abort();
    };
  }, [actionState.requestId]);

  const running = status.status === "RUNNING";
  const progress =
    status.totalCount > 0
      ? Math.min(100, (status.processedCount / status.totalCount) * 100)
      : 0;
  const visibleMessage =
    pollError ||
    (actionState.message && (!actionState.started || running)
      ? actionState.message
      : null);

  return (
    <main className="shell dashboard-shell">
      <header className="site-header">
        <Link className="brand" href="/">
          Meta<span>Games</span>
        </Link>
        <Link className="back-link" href="/">
          ← Catalog
        </Link>
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Scraper monitor</p>
          <div className="dashboard-title-row">
            <h1>{running ? status.currentGame || "Preparing run…" : "Pipeline status"}</h1>
            <span className={`status-badge status-${status.status.toLowerCase()}`}>
              {status.status}
            </span>
          </div>
          <p className="dashboard-subtitle">
            {running
              ? `${status.processedCount} / ${status.totalCount} processed`
              : status.finishedAt
                ? `Last run finished ${timeLabel(status.finishedAt)}`
                : "No scraper runs recorded yet"}
          </p>
        </div>

        <form action={formAction}>
          <button
            className="run-button"
            type="submit"
            disabled={running || isPending}
          >
            {isPending ? "Запускаю…" : running ? "RUNNING" : "RUN NOW"}
          </button>
        </form>
      </section>

      {visibleMessage && (
        <p
          className={`dashboard-message ${
            actionState.started ? "message-success" : ""
          }`}
        >
          {visibleMessage}
        </p>
      )}

      <section className="monitor-panel">
        <div className="progress-copy">
          <span>Progress</span>
          <strong>
            {status.processedCount} / {status.totalCount}
          </strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={status.totalCount}
          aria-valuenow={status.processedCount}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="dashboard-stats">
          <Stat label="Success" value={status.successCount} tone="success" />
          <Stat label="Failed" value={status.failedCount} tone="failed" />
          <Stat
            label="Source"
            value={sourceLabel(status.source, status.page)}
          />
          <Stat label="Page" value={status.page ?? "—"} />
          <Stat label="Started" value={timeLabel(status.startedAt)} />
          <Stat label="Finished" value={timeLabel(status.finishedAt)} />
        </div>

        {status.errorMessage && (
          <div className="last-error">
            <span>Last error</span>
            <p>{status.errorMessage}</p>
          </div>
        )}
      </section>

      {status.history.length > 0 && (
        <section className="run-history">
          <div className="section-heading">
            <p className="eyebrow">Recent activity</p>
            <h2>Last five runs</h2>
          </div>
          <div className="history-table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Result</th>
                  <th>Success</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {status.history.map((run) => (
                  <tr key={run.id}>
                    <td>{timeLabel(run.startedAt)}</td>
                    <td>{sourceLabel(run.source, run.page)}</td>
                    <td>
                      <span
                        className={`history-result status-${run.status.toLowerCase()}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td>{run.successCount}</td>
                    <td>{run.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "failed";
}) {
  return (
    <div className={`dashboard-stat ${tone ? `stat-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
