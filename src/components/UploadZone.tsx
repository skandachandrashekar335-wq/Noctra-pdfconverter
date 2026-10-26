"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  runConversion,
  validateFile,
  deriveOutputFileName,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/conversion";
import { ConversionStatus } from "@/types";

type Phase =
  | "idle"
  | "dragover"
  | "validating"
  | "processing"
  | "done"
  | "error";

interface UploadState {
  phase: Phase;
  fileName?: string;
  fileSize?: number;
  progress: number; // 0–100
  progressLabel?: string;
  error?: string;
  outputUrl?: string;
  outputFileName?: string;
  /**
   * Set when the conversion succeeded but its history record could not be
   * saved. Kept strictly separate from `error`: the download works, so this
   * must never read as a conversion failure.
   */
  historyError?: string;
}

interface UploadZoneProps {
  /**
   * Called after a conversion settles (success or failure). The dashboard
   * uses it to bump the history list's refresh token, so a finished
   * conversion shows up without polling or a reload.
   */
  onConversionSettled?: () => void;
}

export function UploadZone({ onConversionSettled }: UploadZoneProps = {}) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<UploadState>({ phase: "idle", progress: 0 });

  const processFile = useCallback(
    async (file: File) => {
      if (!user) return;

      // Basic validation
      const validationError = validateFile(file);
      if (validationError) {
        setState({ phase: "error", error: validationError, progress: 0 });
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase();
      const outputName = deriveOutputFileName(file.name);

      setState({
        phase: "processing",
        fileName: file.name,
        fileSize: file.size,
        progress: 5,
        progressLabel: "Preparing…",
      });

      await runConversion(file, {
        onStatusChange: (status: ConversionStatus) => {
          if (status === "processing") {
            setState((s) => ({
              ...s,
              progress: 10,
              progressLabel: "Analysing document…",
            }));
          }
        },
        onProgress: (page, total) => {
          const pct = Math.round(10 + (page / total) * 85);
          setState((s) => ({
            ...s,
            progress: pct,
            progressLabel:
              ext === "pptx"
                ? `Processing slide ${page} of ${total}…`
                : ext === "docx"
                  ? `Updating document part ${page} of ${total}…`
                : `Converting page ${page} of ${total}…`,
          }));
        },
        onComplete: (outputDataUrl) => {
          setState({
            phase: "done",
            fileName: file.name,
            fileSize: file.size,
            progress: 100,
            progressLabel: "Complete!",
            outputUrl: outputDataUrl,
            outputFileName: outputName,
          });
          // The record may still be settling server-side; a short delay lets
          // the final status land before the list refetches.
          onConversionSettled?.();
        },
        onError: (error) => {
          setState((s) => ({
            ...s,
            phase: "error",
            error,
            progress: 0,
          }));
          onConversionSettled?.();
        },
        // History problems are advisory: keep the finished download on
        // screen and attach a calm note rather than an error card.
        onHistoryError: (message) => {
          setState((s) => ({
            ...s,
            historyError:
              "Your conversion finished, but it could not be added to your history. " +
              message,
          }));
        },
      });
    },
    [user, onConversionSettled]
  );

  // ─── Drag feedback (small, decorative only) ────────────────────────────
  useEffect(() => {
    if (state.phase !== "dragover") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let anim: { revert: () => void } | null = null;

    (async () => {
      try {
        const { animate } = await import("animejs");
        if (cancelled || !iconRef.current) return;
        anim = animate(iconRef.current, {
          scale: [1, 1.1, 1],
          rotate: [0, -5, 5, 0],
          duration: 520,
          ease: "outQuad",
        });
      } catch {
        /* animation is decorative — ignore bundle/load failures */
      }
    })();

    return () => {
      cancelled = true;
      try {
        anim?.revert();
      } catch {
        /* element may already be unmounted */
      }
    };
  }, [state.phase]);

  // ─── Drag-and-drop handlers ───────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((s) => (s.phase === "idle" ? { ...s, phase: "dragover" } : s));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState((s) => (s.phase === "dragover" ? { ...s, phase: "idle" } : s));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [processFile]
  );

  const reset = () => setState({ phase: "idle", progress: 0 });

  return (
    <div className="upload-root">
      {/* ── Idle / Drag-over ── */}
      {(state.phase === "idle" || state.phase === "dragover") && (
        <div
          className={`drop-zone ${state.phase === "dragover" ? "dragover" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
           aria-label="Upload a PDF, DOCX or PPTX file"
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
             accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={handleFileInput}
            className="sr-only"
            aria-hidden="true"
          />

          <div className="drop-icon" aria-hidden="true" ref={iconRef}>
            {state.phase === "dragover" ? <DropActiveIcon /> : <UploadIcon />}
          </div>

          <div className="drop-text">
            <p className="drop-title">
              {state.phase === "dragover"
                ? "Drop it here"
                : "Drop your document here"}
            </p>
            <p className="drop-sub">
              or <span className="drop-link">browse to upload</span>
            </p>
            <p className="drop-hint">
               PDF · DOCX · PPTX &nbsp;·&nbsp; up to{" "}
              {MAX_FILE_SIZE_BYTES / 1024 / 1024} MB
            </p>
          </div>
        </div>
      )}

      {/* ── Processing ── */}
      {state.phase === "processing" && (
        <div className="panel progress-card" role="status" aria-live="polite">
          <div className="prog-file-info">
            <FileIcon ext={state.fileName?.split(".").pop() ?? "pdf"} />
            <div className="prog-file-meta">
              <p className="prog-filename">{state.fileName}</p>
              <p className="prog-size">{formatSize(state.fileSize ?? 0)}</p>
            </div>
          </div>

          <div className="prog-bar-wrap">
            <div
              className="prog-bar-fill"
              style={{ width: `${state.progress}%` }}
              role="progressbar"
              aria-valuenow={state.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          <div className="prog-foot">
            <p className="prog-label">{state.progressLabel}</p>
            <p className="prog-pct">{state.progress}%</p>
          </div>

          <p className="prog-note">
             Transforming in your browser — no upload needed. DOCX remains editable; PDF export is not performed here.
          </p>
        </div>
      )}

      {/* ── Done ── */}
      {state.phase === "done" && state.outputUrl && (
        <div className="panel done-card">
          <div className="done-header">
            <span className="done-badge" aria-hidden="true">
              <CheckIcon />
            </span>
            <div>
              <p className="done-title">Conversion complete</p>
              <p className="done-sub">{state.fileName}</p>
            </div>
          </div>

          <div className="done-actions">
            <a
              href={state.outputUrl}
              download={state.outputFileName}
              className="noctra-btn-primary done-download"
            >
              <DownloadIcon />
              Download dark version
            </a>
            <button onClick={reset} className="noctra-btn-secondary done-new">
              Convert another
            </button>
          </div>

          {/* Advisory only — the conversion above genuinely succeeded, so
              this is a note, not an alert, and never role="alert". */}
          {state.historyError && (
            <p className="done-history-note">
              <HistoryNoteIcon />
              <span>{state.historyError}</span>
            </p>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {state.phase === "error" && (
        <div className="panel error-card" role="alert">
          <span className="error-badge" aria-hidden="true">
            <ErrorIcon />
          </span>
          <div className="error-body">
            <p className="error-title">Something went wrong</p>
            <p className="error-msg">{state.error}</p>
          </div>
          <button onClick={reset} className="noctra-btn-secondary error-retry">
            Try again
          </button>
        </div>
      )}

      <style jsx>{`
        .upload-root {
          width: 100%;
        }

        /* ── Drop zone ── */
        .drop-zone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 24px;
          padding: clamp(48px, 8vw, 80px) 24px;
          min-height: 320px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xl);
          background: var(--bg-surface);
          cursor: pointer;
          text-align: center;
          transition: border-color var(--transition-base),
            background var(--transition-base);
        }
        .drop-zone:hover {
          border-color: var(--border-strong);
        }
        .drop-zone.dragover {
          border-color: var(--accent-purple);
          background: var(--accent-purple-dim);
        }
        .drop-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          color: var(--text-primary);
          transition: border-color var(--transition-base),
            color var(--transition-base),
            background var(--transition-base);
        }
        .drop-zone.dragover .drop-icon {
          border-color: var(--accent-purple);
          color: var(--accent-purple);
          background: transparent;
        }
        .drop-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(1.25rem, 2.6vw, 1.75rem);
          line-height: 1;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          color: var(--text-primary);
          text-align: center;
        }
        .drop-sub {
          margin-top: 12px;
          font-size: 0.9375rem;
          color: var(--text-secondary);
          text-align: center;
        }
        .drop-link {
          color: var(--accent-purple);
          text-decoration: underline;
          text-decoration-style: solid;
          text-underline-offset: 3px;
        }
        .drop-hint {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid var(--border-hairline);
          color: var(--text-muted);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-align: center;
          width: 100%;
          max-width: 280px;
          margin-inline: auto;
        }

        /* ── Shared panel ── */
        .panel {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xl);
          padding: clamp(24px, 4vw, 36px);
        }

        /* ── Progress ── */
        .progress-card {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .prog-file-info {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .prog-file-meta {
          flex: 1;
          min-width: 0;
        }
        .prog-filename {
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 1.0625rem;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .prog-size {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-top: 4px;
        }
        .prog-bar-wrap {
          width: 100%;
          height: 3px;
          background: var(--border-subtle);
          overflow: hidden;
        }
        .prog-bar-fill {
          height: 100%;
          background: var(--accent-purple);
          transition: width 300ms ease;
        }
        .prog-foot {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
        }
        .prog-label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-primary);
        }
        .prog-pct {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 0.875rem;
          letter-spacing: -0.02em;
          color: var(--accent-purple);
          font-variant-numeric: tabular-nums;
        }
        .prog-note {
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--text-muted);
          padding-top: 20px;
          border-top: 1px solid var(--border-hairline);
        }

        /* ── Done ── */
        .done-card {
          display: flex;
          flex-direction: column;
          gap: 28px;
        }
        .done-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .done-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border: 1px solid var(--accent-ok);
          border-radius: var(--radius-pill);
          color: var(--accent-ok);
        }
        .done-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.125rem;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          color: var(--text-primary);
        }
        .done-sub {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin-top: 4px;
        }
        .done-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .done-download {
          flex: 1;
          justify-content: center;
          min-width: 200px;
        }
        .done-new {
          flex: 0 0 auto;
        }
        .done-history-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 0;
          padding: 10px 12px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          background: var(--bg-elevated);
          font-size: 0.75rem;
          line-height: 1.5;
          color: var(--text-muted);
        }
        .done-history-note svg {
          flex-shrink: 0;
          margin-top: 1px;
        }

        /* ── Error ── */
        .error-card {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
          border-color: var(--accent-bad);
        }
        .error-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          flex-shrink: 0;
          border: 1px solid var(--accent-bad);
          border-radius: var(--radius-pill);
          color: var(--accent-bad);
        }
        .error-body {
          flex: 1;
          min-width: 200px;
        }
        .error-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.0625rem;
          letter-spacing: -0.04em;
          text-transform: uppercase;
          color: var(--accent-bad);
        }
        .error-msg {
          color: var(--text-secondary);
          font-size: 0.875rem;
          line-height: 1.55;
          margin-top: 6px;
        }
        .error-retry {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Icon components ──────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DropActiveIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l10 10-10 10L2 12z" />
      <path d="M12 8v8" />
    </svg>
  );
}

function FileIcon({ ext }: { ext: string }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-sm)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-secondary)",
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        flexShrink: 0,
      }}
    >
      {ext}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function HistoryNoteIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
