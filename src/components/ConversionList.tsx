"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { canAccessConversion } from "@/lib/access-control";
import {
  fetchHistory,
  HistorySaveError,
  historyFailureMessage,
  resetHistoryAvailability,
} from "@/lib/history-api";
import { Conversion } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing…",
  completed: "Complete",
  failed: "Failed",
};

// Status is never conveyed by colour alone — the label always renders.
const STATUS_COLORS: Record<string, string> = {
  pending: "#9898b0",
  processing: "#7c6dff",
  completed: "#34d399",
  failed: "#f87171",
};

interface ConversionListProps {
  /**
   * Bump this to refetch. The dashboard increments it whenever a conversion
   * settles, so a finished conversion appears without polling or a page
   * reload — the read path stays a plain authenticated GET.
   */
  refreshToken?: number;
}

export function ConversionList({ refreshToken = 0 }: ConversionListProps) {
  const { user } = useAuth();
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const uid = user?.uid;

  useEffect(() => {
    // State resets happen via the `key={user.uid}` remount at the call site,
    // so a previous user's rows can never flash into the next session's list.
    if (!uid) return;

    // Cancellation flag: switching accounts mid-request must not let the old
    // response land in the new session's list.
    let cancelled = false;

    // Deliberately no `setLoading(true)` on refresh — re-showing the skeleton
    // would blank the list the user is reading. The first load starts with
    // `loading: true`; on a refresh the existing rows stay visible until the
    // response lands.
    (async () => {
      let response: Response;
      try {
        response = await fetchHistory();
      } catch (e) {
        // A failed history read is not fatal — the upload zone above keeps
        // working, so say so rather than blanking the section.
        if (cancelled) return;
        // Branch on the typed reason, not on message text — copy can change
        // without silently degrading every branch here.
        setError(
          historyFailureMessage(
            e instanceof HistorySaveError ? e.reason : "bad-response"
          )
        );
        setLoading(false);
        return;
      }

      if (cancelled) return;

      if (!response.ok) {
        setError(
          historyFailureMessage(
            response.status === 401
              ? "unauthorized"
              : response.status === 503
                ? "not-configured"
                : "bad-response"
          )
        );
        setLoading(false);
        return;
      }

      try {
        const body = (await response.json()) as { conversions?: Conversion[] };
        const items = Array.isArray(body.conversions) ? body.conversions : [];
        if (cancelled) return;
        // Defense in depth: the API already scopes reads to the verified
        // token's UID, so this re-check can only ever remove rows, never
        // expose one.
        setConversions(items.filter((c) => canAccessConversion(c, uid)));
        setError(null);
      } catch {
        if (cancelled) return;
        setError("Could not read the conversion history response.");
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, refreshToken, retryToken]);

  if (loading) {
    return <ConversionListSkeleton />;
  }

  if (error) {
    return (
      <div role="alert" className="history-error">
        <p>{error}</p>
        <button
          type="button"
          className="history-retry"
          disabled={retrying}
          onClick={() => {
            resetHistoryAvailability();
            setRetrying(true);
            setError(null);
            setLoading(true);
            setRetryToken((value) => value + 1);
            window.setTimeout(() => setRetrying(false), 250);
          }}
        >
          {retrying ? "Retrying…" : "Retry history"}
        </button>
        <style jsx>{`
          .history-error {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
            padding: clamp(24px, 4vw, 32px) clamp(20px, 3vw, 32px);
            border-top: 1px solid var(--border-hairline);
            border-bottom: 1px solid var(--border-hairline);
            font-size: 0.875rem;
            line-height: 1.6;
            color: var(--accent-bad);
          }
          .history-retry {
            border: 1px solid var(--border-default);
            border-radius: var(--radius-sm);
            background: var(--bg-elevated);
            color: var(--text-primary);
            padding: 9px 13px;
            font: inherit;
            font-size: 0.75rem;
            cursor: pointer;
          }
          .history-retry:hover:not(:disabled) {
            border-color: var(--accent-purple);
          }
          .history-retry:disabled {
            opacity: 0.6;
            cursor: wait;
          }
        `}</style>
      </div>
    );
  }

  if (conversions.length === 0) {
    return <EmptyHistory />;
  }

  return (
    <div className="conversion-list">
      {conversions.map((c) => (
        <ConversionRow key={c.id} conversion={c} />
      ))}
      <style jsx>{`
        .conversion-list {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--border-hairline);
        }
      `}</style>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────
   Deliberately designed rather than a blank box: a hairline frame, an
   editorial numeral, and copy that points back at the upload zone above. */
function EmptyHistory() {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true" />
      <div className="empty-copy">
        <p className="empty-title">No conversions yet</p>
        <p className="empty-sub">
           Upload a PDF, DOCX or PPTX above to get started — everything is processed
          right here in your browser.
        </p>
      </div>
      <style jsx>{`
        .empty-state {
          display: flex;
          align-items: flex-start;
          gap: 20px;
          padding: clamp(32px, 5vw, 48px) clamp(20px, 3vw, 32px);
          border-top: 1px solid var(--border-hairline);
          border-bottom: 1px solid var(--border-hairline);
        }
        .empty-mark {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          margin-top: 2px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          position: relative;
        }
        .empty-mark::before,
        .empty-mark::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          background: var(--border-strong);
          transform: translate(-50%, -50%);
        }
        .empty-mark::before {
          width: 16px;
          height: 1px;
        }
        .empty-mark::after {
          width: 1px;
          height: 16px;
        }
        .empty-copy {
          min-width: 0;
          padding-top: 2px;
        }
        .empty-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.0625rem;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          color: var(--text-primary);
        }
        .empty-sub {
          color: var(--text-muted);
          font-size: 0.875rem;
          line-height: 1.6;
          margin-top: 8px;
          max-width: 46ch;
        }
      `}</style>
    </div>
  );
}

function ConversionRow({ conversion: c }: { conversion: Conversion }) {
  const ext = c.fileType.toUpperCase();
  const statusColor = STATUS_COLORS[c.status] ?? "#9898b0";
  const statusLabel = STATUS_LABELS[c.status] ?? c.status;

  return (
    <div className="conv-row">
      <div className="conv-ext" aria-hidden="true">
        {ext}
      </div>

      <div className="conv-info">
        <p className="conv-name">{c.originalFileName}</p>
        <p className="conv-meta">
          {formatSize(c.originalFileSize)} · {formatDate(c.createdAt)}
          {c.pageCount ? ` · ${c.pageCount} pages` : ""}
        </p>
      </div>

      <div
        className="conv-status"
        style={{ color: statusColor }}
        aria-label={`Status: ${statusLabel}`}
      >
        <StatusDot color={statusColor} animate={c.status === "processing"} />
        {statusLabel}
      </div>

      <style jsx>{`
        .conv-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 4px;
          border-bottom: 1px solid var(--border-hairline);
          transition: background var(--transition-fast);
        }
        .conv-row:hover {
          background: var(--bg-elevated);
        }
        .conv-ext {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 44px;
          height: 30px;
          padding-inline: 8px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          font-size: 0.625rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .conv-info {
          flex: 1;
          min-width: 0;
        }
        .conv-name {
          font-size: 0.9375rem;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .conv-meta {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 3px;
        }
        .conv-status {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}

function StatusDot({ color, animate }: { color: string; animate?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
        animation: animate ? "pulse 1.5s ease-in-out infinite" : "none",
      }}
    />
  );
}

function ConversionListSkeleton() {
  return (
    <div className="skeleton-list">
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-ext" />
          <div className="skeleton-info">
            <div
              className="skeleton-line"
              style={{ width: "55%", height: 13 }}
            />
            <div
              className="skeleton-line"
              style={{ width: "35%", height: 10, marginTop: 8 }}
            />
          </div>
        </div>
      ))}
      <style jsx>{`
        .skeleton-list {
          display: flex;
          flex-direction: column;
          border-top: 1px solid var(--border-hairline);
        }
        .skeleton-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 4px;
          border-bottom: 1px solid var(--border-hairline);
        }
        .skeleton-ext {
          min-width: 44px;
          height: 30px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }
        .skeleton-info {
          flex: 1;
        }
        .skeleton-line {
          background: var(--border-subtle);
          border-radius: 2px;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
