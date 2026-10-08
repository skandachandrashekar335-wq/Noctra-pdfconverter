"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { Conversion } from "@/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing…",
  completed: "Complete",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#9898b0",
  processing: "#7c6dff",
  completed: "#34d399",
  failed: "#f87171",
};

export function ConversionList() {
  const { user } = useAuth();
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "conversions"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Conversion[];
        setConversions(items);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore snapshot error:", err);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  if (loading) {
    return <ConversionListSkeleton />;
  }

  if (conversions.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-title">No conversions yet</p>
        <p className="empty-sub">Upload a PDF or PPTX above to get started.</p>
        <style jsx>{`
          .empty-state {
            padding: 48px 24px;
            text-align: center;
            background: var(--bg-card);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
          }
          .empty-title { font-weight: 600; color: var(--text-primary); }
          .empty-sub { color: var(--text-muted); font-size: 0.875rem; margin-top: 6px; }
        `}</style>
      </div>
    );
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
          gap: 10px;
        }
      `}</style>
    </div>
  );
}

function ConversionRow({ conversion: c }: { conversion: Conversion }) {
  const ext = c.fileType.toUpperCase();
  const colour = c.fileType === "pptx" ? "#f97316" : "#4f8fff";
  const statusColor = STATUS_COLORS[c.status] ?? "#9898b0";

  return (
    <div className="conv-row">
      <div
        className="conv-ext"
        style={{ background: `${colour}18`, color: colour }}
      >
        {ext}
      </div>

      <div className="conv-info">
        <p className="conv-name">{c.originalFileName}</p>
        <p className="conv-meta">
          {formatSize(c.originalFileSize)} ·{" "}
          {formatDate(c.createdAt)}
          {c.pageCount ? ` · ${c.pageCount} pages` : ""}
        </p>
      </div>

      <div
        className="conv-status"
        style={{ color: statusColor }}
        aria-label={`Status: ${STATUS_LABELS[c.status]}`}
      >
        <StatusDot color={statusColor} animate={c.status === "processing"} />
        {STATUS_LABELS[c.status] ?? c.status}
      </div>

      <style jsx>{`
        .conv-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: border-color 200ms ease;
        }
        .conv-row:hover {
          border-color: var(--border-default);
        }
        .conv-ext {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.625rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .conv-info { flex: 1; min-width: 0; }
        .conv-name {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .conv-meta {
          font-size: 0.8125rem;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .conv-status {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8125rem;
          font-weight: 500;
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
        width: 7,
        height: 7,
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
            <div className="skeleton-line" style={{ width: "55%", height: 14 }} />
            <div className="skeleton-line" style={{ width: "35%", height: 11, marginTop: 6 }} />
          </div>
        </div>
      ))}
      <style jsx>{`
        .skeleton-list { display: flex; flex-direction: column; gap: 10px; }
        .skeleton-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .skeleton-ext {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: var(--border-subtle);
          flex-shrink: 0;
        }
        .skeleton-info { flex: 1; }
        .skeleton-line {
          background: var(--border-subtle);
          border-radius: 4px;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
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
