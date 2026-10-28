"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { canAccessConversion } from "@/lib/access-control";
import {
  fetchHistory,
  deleteHistory,
  updateHistory,
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
  cancelled: "Cancelled",
};

// Status is never conveyed by colour alone — the label always renders.
const STATUS_COLORS: Record<string, string> = {
  pending: "#9898b0",
  processing: "#7c6dff",
  completed: "#34d399",
  failed: "#f87171",
  cancelled: "#f59e0b",
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
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "failed" | "cancelled">("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | "bulk" | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
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

  const visibleConversions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return conversions
      .filter((conversion) => {
        if (statusFilter !== "all" && conversion.status !== statusFilter) return false;
        return !needle || conversion.originalFileName.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (sort === "name") return a.originalFileName.localeCompare(b.originalFileName);
        return sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt;
      });
  }, [conversions, query, sort, statusFilter]);

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

  async function removeOne(id: string) {
    if (!window.confirm("Remove this conversion from your history? The downloaded file is not affected.")) return;
    setDeleting(id);
    try {
      await deleteHistory(id);
      setConversions((items) => items.filter((item) => item.id !== id));
      setSelected((items) => {
        const next = new Set(items);
        next.delete(id);
        return next;
      });
    } catch {
      setError("Could not remove that history record. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  async function removeSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`Remove ${selected.size} conversion${selected.size === 1 ? "" : "s"} from your history?`)) return;
    setDeleting("bulk");
    try {
      await Promise.all([...selected].map((id) => deleteHistory(id)));
      setConversions((items) => items.filter((item) => !selected.has(item.id)));
      setSelected(new Set());
    } catch {
      setError("Some records could not be removed. Refresh history and try again.");
    } finally {
      setDeleting(null);
    }
  }

  async function updateRow(id: string, patch: { isFavorite?: boolean; tags?: string[] }) {
    setUpdating(id);
    try {
      const updated = await updateHistory(id, patch);
      setConversions((items) => items.map((item) => (item.id === id ? updated : item)));
    } catch {
      setError("Could not save that organization change. Please try again.");
    } finally {
      setUpdating(null);
    }
  }

  if (conversions.length === 0) {
    return <EmptyHistory />;
  }

  const allVisibleSelected = visibleConversions.length > 0 && visibleConversions.every((item) => selected.has(item.id));

  return (
    <div>
      <div className="history-toolbar" aria-label="History controls">
        <label className="history-search">
          <span className="sr-only">Search history</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" />
        </label>
        <label className="history-select">
          <span className="sr-only">Filter history by status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">All results</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="history-select">
          <span className="sr-only">Sort history</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Filename</option>
          </select>
        </label>
      </div>
      <div className="history-bulkbar">
        <label>
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={() => setSelected((items) => {
              const next = new Set(items);
              if (allVisibleSelected) visibleConversions.forEach((item) => next.delete(item.id));
              else visibleConversions.forEach((item) => next.add(item.id));
              return next;
            })}
          />
          Select visible
        </label>
        <button type="button" className="history-bulk-delete" disabled={selected.size === 0 || deleting !== null} onClick={removeSelected}>
          {deleting === "bulk" ? "Removing…" : `Remove selected${selected.size ? ` (${selected.size})` : ""}`}
        </button>
      </div>
      <div className="conversion-list">
        {visibleConversions.length === 0 ? (
          <p className="history-filter-empty">No history matches those filters.</p>
        ) : visibleConversions.map((c) => (
          <ConversionRow
            key={c.id}
            conversion={c}
            selected={selected.has(c.id)}
            deleting={deleting === c.id}
            updating={updating === c.id}
            onSelect={(checked) => setSelected((items) => {
              const next = new Set(items);
              if (checked) next.add(c.id); else next.delete(c.id);
              return next;
            })}
            onDelete={() => removeOne(c.id)}
            onToggleFavorite={() => void updateRow(c.id, { isFavorite: !c.isFavorite })}
            onSaveTags={(tags) => void updateRow(c.id, { tags })}
          />
        ))}
      </div>
      <style jsx>{`
        .history-toolbar,
        .history-bulkbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .history-search { flex: 1 1 220px; }
        .history-search input,
        .history-select select {
          width: 100%;
          min-height: 38px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-primary);
          padding: 8px 10px;
          font: inherit;
          font-size: 0.8125rem;
        }
        .history-select { flex: 0 1 150px; }
        .history-bulkbar {
          justify-content: space-between;
          color: var(--text-muted);
          font-size: 0.75rem;
          padding-bottom: 8px;
        }
        .history-bulkbar label { display: inline-flex; align-items: center; gap: 8px; }
        .history-bulk-delete {
          border: 0;
          background: transparent;
          color: var(--accent-bad);
          cursor: pointer;
          font: inherit;
          font-size: 0.75rem;
        }
        .history-bulk-delete:disabled { opacity: 0.45; cursor: not-allowed; }
        .history-filter-empty { padding: 24px 0; color: var(--text-muted); font-size: 0.875rem; }
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

function ConversionRow({
  conversion: c,
  selected,
  deleting,
  updating,
  onSelect,
  onDelete,
  onToggleFavorite,
  onSaveTags,
}: {
  conversion: Conversion;
  selected: boolean;
  deleting: boolean;
  updating: boolean;
  onSelect: (checked: boolean) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onSaveTags: (tags: string[]) => void;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const ext = c.fileType.toUpperCase();
  const statusColor = STATUS_COLORS[c.status] ?? "#9898b0";
  const statusLabel = STATUS_LABELS[c.status] ?? c.status;

  return (
    <div className="conv-row">
      <label className="conv-check">
        <span className="sr-only">Select {c.originalFileName}</span>
        <input type="checkbox" checked={selected} onChange={(event) => onSelect(event.target.checked)} />
      </label>
      <div className="conv-ext" aria-hidden="true">
        {ext}
      </div>

      <button
        type="button"
        className={`conv-favorite ${c.isFavorite ? "is-favorite" : ""}`}
        onClick={onToggleFavorite}
        disabled={updating}
        aria-pressed={Boolean(c.isFavorite)}
        aria-label={c.isFavorite ? `Remove ${c.originalFileName} from favourites` : `Favourite ${c.originalFileName}`}
      >
        {c.isFavorite ? "★" : "☆"}
      </button>

      <div className="conv-info">
        <p className="conv-name">{c.originalFileName}</p>
        <p className="conv-meta">
          {formatSize(c.originalFileSize)} · {formatDate(c.createdAt)}
          {c.pageCount ? ` · ${c.pageCount} pages` : ""}
        </p>
        <div className="conv-tags">
          {(c.tags ?? []).map((tag) => <span key={tag} className="conv-tag">{tag}</span>)}
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const tag = tagDraft.trim();
              if (!tag) return;
              onSaveTags([...new Set([...(c.tags ?? []), tag])].slice(0, 20));
              setTagDraft("");
            }}
            placeholder="Add tag"
            aria-label={`Add tag to ${c.originalFileName}`}
            disabled={updating}
          />
        </div>
      </div>

      <div
        className="conv-status"
        style={{ color: statusColor }}
        aria-label={`Status: ${statusLabel}`}
      >
        <StatusDot color={statusColor} animate={c.status === "processing"} />
        {statusLabel}
      </div>
      <button type="button" className="conv-delete" onClick={onDelete} disabled={deleting} aria-label={`Remove ${c.originalFileName} from history`}>
        {deleting ? "Removing…" : "Remove"}
      </button>

      <style jsx>{`
        .conv-row {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 18px 4px;
          border-bottom: 1px solid var(--border-hairline);
          transition: background var(--transition-fast);
        }
        .conv-check { display: inline-flex; align-items: center; flex-shrink: 0; }
        .conv-delete {
          flex-shrink: 0;
          border: 0;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          font: inherit;
          font-size: 0.6875rem;
        }
        .conv-delete:hover:not(:disabled) { color: var(--accent-bad); }
        .conv-delete:disabled { opacity: 0.5; cursor: wait; }
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
        .conv-favorite { flex-shrink: 0; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 1.1rem; line-height: 1; }
        .conv-favorite.is-favorite { color: var(--accent-warn); }
        .conv-favorite:disabled { opacity: .45; cursor: wait; }
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
        .conv-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
        .conv-tag { padding: 2px 6px; border: 1px solid var(--border-default); border-radius: var(--radius-pill); color: var(--accent-purple); font-size: .625rem; }
        .conv-tags input { width: 70px; border: 0; border-bottom: 1px solid var(--border-default); background: transparent; color: var(--text-secondary); outline: 0; font: inherit; font-size: .625rem; }
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
