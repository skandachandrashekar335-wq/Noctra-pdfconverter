"use client";

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  runConversion,
  validateFile,
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
}

export function UploadZone() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      const outputName = file.name.replace(/\.(pdf|pptx)$/i, "-dark.$1");

      setState({
        phase: "processing",
        fileName: file.name,
        fileSize: file.size,
        progress: 5,
        progressLabel: "Preparing…",
      });

      await runConversion(file, user.uid, {
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
        },
        onError: (error) => {
          setState((s) => ({
            ...s,
            phase: "error",
            error,
            progress: 0,
          }));
        },
      });
    },
    [user]
  );

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
          aria-label="Upload a PDF or PPTX file"
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={handleFileInput}
            className="sr-only"
            aria-hidden="true"
          />

          <div className="drop-icon" aria-hidden="true">
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
              PDF · PPTX &nbsp;·&nbsp; up to{" "}
              {MAX_FILE_SIZE_BYTES / 1024 / 1024} MB
            </p>
          </div>
        </div>
      )}

      {/* ── Processing ── */}
      {state.phase === "processing" && (
        <div className="progress-card" role="status" aria-live="polite">
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

          <p className="prog-label">{state.progressLabel}</p>
          <p className="prog-note">
            Converting in your browser — no upload needed.
          </p>
        </div>
      )}

      {/* ── Done ── */}
      {state.phase === "done" && state.outputUrl && (
        <div className="done-card">
          <div className="done-header">
            <CheckIcon />
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
        </div>
      )}

      {/* ── Error ── */}
      {state.phase === "error" && (
        <div className="error-card" role="alert">
          <ErrorIcon />
          <div>
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

        /* Drop zone */
        .drop-zone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 56px 32px;
          border: 2px dashed var(--border-default);
          border-radius: var(--radius-xl);
          background: var(--bg-surface);
          cursor: pointer;
          transition: border-color 200ms ease, background 200ms ease,
            transform 200ms ease;
          min-height: 260px;
        }
        .drop-zone:hover,
        .drop-zone.dragover {
          border-color: var(--accent-purple);
          background: var(--accent-purple-dim);
          transform: scale(1.01);
        }
        .drop-icon {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-purple-dim);
          border-radius: 16px;
          color: var(--accent-purple);
        }
        .drop-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          text-align: center;
        }
        .drop-sub {
          color: var(--text-secondary);
          text-align: center;
          margin-top: 4px;
        }
        .drop-link {
          color: var(--accent-purple);
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 3px;
        }
        .drop-hint {
          color: var(--text-muted);
          font-size: 0.8125rem;
          text-align: center;
          margin-top: 8px;
        }

        /* Progress card */
        .progress-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .prog-file-info {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .prog-file-meta { flex: 1; min-width: 0; }
        .prog-filename {
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .prog-size { font-size: 0.8125rem; color: var(--text-muted); }
        .prog-bar-wrap {
          width: 100%;
          height: 6px;
          background: var(--border-subtle);
          border-radius: 3px;
          overflow: hidden;
        }
        .prog-bar-fill {
          height: 100%;
          background: var(--gradient-accent);
          border-radius: 3px;
          transition: width 300ms ease;
        }
        .prog-label {
          font-weight: 500;
          color: var(--accent-purple);
          font-size: 0.875rem;
        }
        .prog-note { font-size: 0.8125rem; color: var(--text-muted); }

        /* Done card */
        .done-card {
          background: var(--bg-card);
          border: 1px solid rgba(124, 109, 255, 0.25);
          border-radius: var(--radius-xl);
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .done-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .done-title { font-weight: 600; font-size: 1.0625rem; }
        .done-sub { color: var(--text-secondary); font-size: 0.875rem; margin-top: 2px; }
        .done-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .done-download { flex: 1; justify-content: center; min-width: 180px; }
        .done-new { flex: 0 0 auto; }

        /* Error card */
        .error-card {
          background: var(--bg-card);
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: var(--radius-xl);
          padding: 32px;
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        .error-title { font-weight: 600; color: #f87171; }
        .error-msg { color: var(--text-secondary); font-size: 0.875rem; margin-top: 4px; }
        .error-retry { margin-left: auto; flex-shrink: 0; }
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
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function DropActiveIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l10 10-10 10L2 12z" />
      <path d="M12 8v8" />
    </svg>
  );
}

function FileIcon({ ext }: { ext: string }) {
  const colour = ext === "pptx" ? "#f97316" : "#4f8fff";
  return (
    <div style={{
      width: 44,
      height: 44,
      background: `${colour}18`,
      borderRadius: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: colour,
      fontSize: "0.6875rem",
      fontWeight: 700,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      flexShrink: 0,
    }}>
      {ext}
    </div>
  );
}

function CheckIcon() {
  return (
    <div style={{
      width: 44,
      height: 44,
      background: "rgba(52, 211, 153, 0.1)",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#34d399",
      flexShrink: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <div style={{
      width: 44,
      height: 44,
      background: "rgba(248, 113, 113, 0.1)",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#f87171",
      flexShrink: 0,
    }}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    </div>
  );
}
