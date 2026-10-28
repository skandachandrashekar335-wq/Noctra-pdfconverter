"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  runConversion,
  validateFile,
  deriveOutputFileName,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/conversion";
import { PDFReader } from "@/components/PDFReader";
import { revokeObjectUrl } from "@/lib/temp-resources";
import {
  CONVERSION_PROFILES,
  DEFAULT_CONVERSION_PROFILE,
  type ConversionProfileId,
} from "@/lib/conversion-profiles";
import type { ConversionQualityReport } from "@/lib/conversion";
import {
  createOutputResourceRegistry,
  type OutputResourceRegistry,
} from "@/lib/output-resources";

type Phase =
  | "idle"
  | "dragover"
  | "validating"
  | "processing"
  | "finalizing"
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
  originalUrl?: string;
  outputFileName?: string;
  /**
   * Measured PDF quality report (real pixel classification counts from the
   * transform). Absent for DOCX/PPTX, which are structural transforms.
   */
  quality?: ConversionQualityReport;
  /**
   * Set when the conversion succeeded but its history record could not be
   * saved. Kept strictly separate from `error`: the download works, so this
   * must never read as a conversion failure.
   */
  historyError?: string;
  /**
   * JSON diagnostics for this conversion run (real timings + environment
   * facts). Rendered in a disclosure on the done card; never auto-sent.
   */
  diagnostics?: string;
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
  const [readerOpen, setReaderOpen] = useState(false);
  // Dark-mode palette applied to this conversion (same pipeline the batch
  // workspace uses). Changing it never touches a finished result — the next
  // conversion picks it up.
  const [profile, setProfile] = useState<ConversionProfileId>(
    DEFAULT_CONVERSION_PROFILE
  );
  const conversionControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Kept for the retry path: the last file attempted, and the history record
  // id its run created (when known) so a retry updates that record instead of
  // adding a duplicate history entry.
  const lastFileRef = useRef<File | null>(null);
  const historyIdRef = useRef<string | null>(null);
  // Phase timestamps for the diagnostics disclosure — measured, not guessed.
  const timingsRef = useRef<{
    started?: number;
    processing?: number;
    finalizing?: number;
    completed?: number;
  }>({});

  // Owns every object URL this panel renders. Nothing is revoked because a
  // download started: the download link, the before/after preview and the
  // reader all keep consuming these URLs until reset or unmount releases them.
  // Lazy state (not a ref) keeps the registry stable across renders without
  // reading a ref during render.
  const [resources] = useState<OutputResourceRegistry>(createOutputResourceRegistry);

  const releaseCurrentResources = useCallback(() => {
    resources.releaseAll();
  }, [resources]);

  useEffect(() => () => {
    mountedRef.current = false;
    conversionControllerRef.current?.abort();
    conversionControllerRef.current = null;
    releaseCurrentResources();
  }, [releaseCurrentResources]);

  const processFile = useCallback(
    async (file: File, retryHistoryId?: string | null) => {
      if (!user) return;

      conversionControllerRef.current?.abort();
      releaseCurrentResources();

      // Remembered for the retry path (see the error card below).
      lastFileRef.current = file;
      historyIdRef.current = retryHistoryId ?? null;

      // Basic validation
      const validationError = validateFile(file);
      if (validationError) {
        setState({ phase: "error", error: validationError, progress: 0 });
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase();
      const outputName = deriveOutputFileName(file.name);

      const originalUrl = ext === "pdf" ? URL.createObjectURL(file) : undefined;
      if (originalUrl) resources.retain("original", originalUrl);
      timingsRef.current = { started: performance.now() };
      setState({
        phase: "processing",
        fileName: file.name,
        fileSize: file.size,
        progress: 5,
        progressLabel: "Preparing…",
        originalUrl,
      });

      const controller = new AbortController();
      conversionControllerRef.current = controller;
      await runConversion(
        file,
        {
          signal: controller.signal,
          profile,
          onPhase: (phase) => {
            if (conversionControllerRef.current !== controller) return;
            // Terminal phases arrive through onComplete/onError/onCancelled
            // (they carry the URL/error) — only in-flight states are handled
            // here so no callback can double-drive the card.
            if (phase === "queued") {
              setState((s) => ({
                ...s,
                progress: 5,
                progressLabel: "Preparing…",
              }));
            } else if (phase === "processing") {
              timingsRef.current.processing ??= performance.now();
              setState((s) => ({
                ...s,
                progress: 10,
                progressLabel: "Analysing document…",
              }));
            } else if (phase === "finalizing") {
              setState((s) => ({
                ...s,
                phase: "finalizing",
                progress: Math.max(s.progress, 90),
              }));
            }
          },
          onProgress: (page, total) => {
            if (conversionControllerRef.current !== controller) return;
            // Page progress owns 10–90%; the export tail owns 92–99%, so a
            // document can no longer sit at 95% while finalization runs.
            const pct = Math.round(10 + (page / total) * 80);
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
          onFinalizing: (label) => {
            if (conversionControllerRef.current !== controller) return;
            timingsRef.current.finalizing ??= performance.now();
            setState((s) => ({
              ...s,
              phase: "finalizing",
              progress: Math.min(99, Math.max(s.progress + 2, 92)),
              progressLabel: label,
            }));
          },
          onConversionId: (id) => {
            if (conversionControllerRef.current !== controller) return;
            // Remembered so a retry updates this record instead of creating
            // a duplicate history entry for the same file.
            historyIdRef.current = id;
          },
          onComplete: (outputDataUrl, _conversionId, quality) => {
            if (!mountedRef.current || conversionControllerRef.current !== controller) {
              revokeObjectUrl(outputDataUrl);
              return;
            }
            // The download link, the before/after preview and the reader all
            // keep consuming this URL, so it stays alive until reset/unmount —
            // a download never revokes it.
            resources.retain("output", outputDataUrl);
            timingsRef.current.completed = performance.now();
            setState((s) => ({
              ...s,
              phase: "done",
              fileName: file.name,
              fileSize: file.size,
              progress: 100,
              progressLabel: "Complete!",
              outputUrl: outputDataUrl,
              outputFileName: outputName,
              quality,
            }));
            // Real byte size of the produced file (the blob URL is in-memory,
            // so this read is instant) — feeds the diagnostics disclosure.
            void buildDiagnostics(
              file,
              profile,
              quality,
              outputDataUrl,
              { ...timingsRef.current }
            ).then(
              (diagnostics) => {
                if (!mountedRef.current) return;
                setState((s) =>
                  s.phase === "done" && s.outputUrl === outputDataUrl
                    ? { ...s, diagnostics }
                    : s
                );
              }
            );
            // The record may still be settling server-side; a short delay lets
            // the final status land before the list refetches.
            onConversionSettled?.();
          },
          onError: (error) => {
            if (conversionControllerRef.current !== controller) return;
            resources.release("original");
            setState((s) => ({
              ...s,
              phase: "error",
              error,
              progress: 0,
              originalUrl: undefined,
            }));
            onConversionSettled?.();
          },
          onCancelled: () => {
            if (conversionControllerRef.current !== controller) return;
            resources.release("original");
            setState((s) => ({
              ...s,
              phase: "error",
              error: "Conversion cancelled.",
              progress: 0,
              originalUrl: undefined,
            }));
            onConversionSettled?.();
          },
          // History problems are advisory: keep the finished download on
          // screen and attach a calm note rather than an error card.
          onHistoryError: (message) => {
            if (!mountedRef.current || conversionControllerRef.current !== controller) return;
            setState((s) => ({
              ...s,
              historyError:
                "Your conversion finished, but it could not be added to your history. " +
                message,
            }));
          },
        },
        // A retry reuses the previous attempt's history record so one file
        // failure + retry yields a single history entry.
        retryHistoryId ? { historyId: retryHistoryId } : {}
      );
    },
    [onConversionSettled, profile, releaseCurrentResources, resources, user]
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

  const reset = () => {
    setReaderOpen(false);
    conversionControllerRef.current?.abort();
    conversionControllerRef.current = null;
    lastFileRef.current = null;
    historyIdRef.current = null;
    releaseCurrentResources();
    setState({ phase: "idle", progress: 0 });
  };

  /** Retry the last file in place, reusing its history record when known. */
  const retryLastFile = () => {
    const file = lastFileRef.current;
    if (!file) {
      reset();
      return;
    }
    void processFile(file, historyIdRef.current);
  };

  const handleDownload = () => {
    if (!state.outputUrl) return;
    // Record the dispatch so reset/unmount grants the in-flight download its
    // grace period. The URL itself is never revoked here: the link must stay
    // usable for repeated clicks and the preview/reader still consume it.
    resources.markDownloaded("output");
  };

  return (
    <div className="upload-root">
      {/* ── Idle / Drag-over ── */}
      {(state.phase === "idle" || state.phase === "dragover") && (
        <>
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

          {/* Applies to the next conversion only — never re-processes a
              finished result. Lives outside the clickable drop zone so the
              select never triggers the file picker. */}
          <label className="profile-row">
            <span>Dark theme</span>
            <select
              value={profile}
              onChange={(e) =>
                setProfile(e.target.value as ConversionProfileId)
              }
              disabled={state.phase === "dragover"}
              aria-label="Dark theme applied to the conversion"
            >
              {CONVERSION_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {/* ── Processing / Finalizing ── */}
      {(state.phase === "processing" || state.phase === "finalizing") && (
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
              onClick={handleDownload}
              className="noctra-btn-primary done-download"
            >
              <DownloadIcon />
              Download dark version
            </a>
            <button onClick={reset} className="noctra-btn-secondary done-new">
              Convert another
            </button>
            {state.fileName?.toLowerCase().endsWith(".pdf") && (
              <button
                type="button"
                onClick={() => setReaderOpen((open) => !open)}
                className="noctra-btn-secondary done-new"
              >
                {readerOpen ? "Close reader" : "Open reader"}
              </button>
            )}
          </div>

          {/* Advisory only — the conversion above genuinely succeeded, so
              this is a note, not an alert, and never role="alert". */}
          {state.historyError && (
            <p className="done-history-note">
              <HistoryNoteIcon />
              <span>{state.historyError}</span>
            </p>
          )}
          {/* Measured from the actual transform: real classification counts,
              never estimates. PDF only — DOCX/PPTX are structural. */}
          {state.quality && (
            <section className="done-quality" aria-label="OLED quality report">
              <p className="done-quality-title">
                OLED quality report — measured on this document
              </p>
              <dl>
                <div>
                  <dt>Theme</dt>
                  <dd>{state.quality.profileLabel}</dd>
                </div>
                <div>
                  <dt>Pages</dt>
                  <dd>{state.quality.pages}</dd>
                </div>
                <div>
                  <dt>Darkened</dt>
                  <dd>{state.quality.darkenedPct}%</dd>
                </div>
                <div>
                  <dt>Text remapped</dt>
                  <dd>{state.quality.textPct}%</dd>
                </div>
                <div>
                  <dt>Images kept</dt>
                  <dd>{state.quality.contentPct}%</dd>
                </div>
                <div>
                  <dt>Output size</dt>
                  <dd>{formatSize(state.quality.outputBytes)}</dd>
                </div>
              </dl>
            </section>
          )}
          {state.diagnostics && (
            <DiagnosticsDisclosure json={state.diagnostics} />
          )}
          {state.originalUrl && (
            <div className="preview-comparison" aria-label="Before and after PDF preview">
              <figure className="preview-pane"><figcaption>Bright original</figcaption><iframe src={state.originalUrl} title="Original PDF preview" /></figure>
              <figure className="preview-pane"><figcaption>Dark transformed</figcaption><iframe src={state.outputUrl} title="Converted PDF preview" /></figure>
            </div>
          )}
          {readerOpen && state.fileName && (
            <PDFReader
              sourceUrl={state.outputUrl}
              fileName={state.outputFileName ?? state.fileName}
              onClose={() => setReaderOpen(false)}
            />
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
          <div className="error-actions">
            {/* Real retry: re-runs the retained file against the same history
                record, so a recoverable failure needs no re-upload and adds
                no duplicate history entry. */}
            <button onClick={retryLastFile} className="noctra-btn-primary error-retry">
              Try again
            </button>
            <button onClick={reset} className="noctra-btn-secondary error-retry">
              Start over
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .upload-root {
          width: 100%;
        }

        /* ── Profile picker (idle only) ── */
        .profile-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 12px;
          color: var(--text-muted);
          font-size: 0.75rem;
        }
        .profile-row select {
          min-height: 38px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          background: var(--bg-base);
          color: var(--text-primary);
          padding: 0 12px;
          font: inherit;
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
        /* ── OLED quality report (measured, PDF only) ── */
        .done-quality {
          padding: 14px 16px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-inset);
        }
        .done-quality-title {
          margin: 0 0 10px;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .done-quality dl {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
          gap: 10px 16px;
          margin: 0;
        }
        .done-quality div {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .done-quality dt {
          font-size: 0.6875rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .done-quality dd {
          margin: 0;
          font-size: 0.875rem;
          color: var(--text-primary);
          font-variant-numeric: tabular-nums;
        }
        /* ── Diagnostics disclosure ── */
        .done-diag {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-inset);
          font-size: 0.75rem;
        }
        .done-diag summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
          cursor: pointer;
          color: var(--text-muted);
          user-select: none;
          list-style: none;
        }
        .done-diag summary::-webkit-details-marker {
          display: none;
        }
        .done-diag-copy {
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          background: var(--bg-base);
          color: var(--text-muted);
          font: inherit;
          font-size: 0.6875rem;
          padding: 2px 10px;
          cursor: pointer;
        }
        .done-diag-copy:hover {
          color: var(--text-primary);
        }
        .done-diag pre {
          margin: 0;
          padding: 10px 12px;
          border-top: 1px solid var(--border-subtle);
          overflow-x: auto;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.6875rem;
          line-height: 1.5;
          color: var(--text-muted);
          white-space: pre;
        }
        .preview-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .preview-pane { min-width: 0; }
        .preview-pane figcaption { margin-bottom: 8px; color: var(--text-muted); font-size: .6875rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
        .preview-pane iframe { display: block; width: 100%; height: 420px; border: 1px solid var(--border-default); border-radius: var(--radius-md); background: #fff; }
        @media (max-width: 720px) { .preview-comparison { grid-template-columns: 1fr; } }

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
        .error-actions {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .error-retry {
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Collapsed-by-default diagnostics for one conversion run. The JSON is shown
 * as-is and copied on demand via the clipboard; if the clipboard is
 * unavailable the text stays selectable — nothing is auto-sent anywhere.
 */
function DiagnosticsDisclosure({ json }: { json: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions/insecure context): leave the
      // <pre> text selectable so the user can copy manually.
    }
  };

  return (
    <details className="done-diag">
      <summary>
        Diagnostics
        <button
          type="button"
          className="done-diag-copy"
          onClick={(event) => {
            event.preventDefault();
            void copy();
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </summary>
      <pre>{json}</pre>
    </details>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Build the JSON diagnostics string for a completed conversion. Every number
 * is measured: real file sizes (the output blob is read for its true byte
 * length), real phase timestamps from the run, real environment facts. It is
 * only ever shown in the done-card disclosure and copied on demand — nothing
 * is sent anywhere.
 */
async function buildDiagnostics(
  file: File,
  profileId: ConversionProfileId,
  quality: ConversionQualityReport | undefined,
  outputUrl: string,
  timings: { started?: number; processing?: number; finalizing?: number; completed?: number }
): Promise<string> {
  // The blob URL is in-memory, so this read is instant and exact.
  let outputBytes: number | null = null;
  try {
    outputBytes = (await (await fetch(outputUrl)).blob()).size;
  } catch {
    outputBytes = null;
  }
  const ms = (from?: number, to?: number) =>
    from != null && to != null ? Math.round(to - from) : null;
  return JSON.stringify(
    {
      file: { name: file.name, bytes: file.size, type: file.name.split(".").pop()?.toLowerCase() ?? null },
      theme: profileId,
      output: { bytes: outputBytes, qualityReport: quality ?? null },
      phasesMs: {
        queuedToProcessing: ms(timings.started, timings.processing),
        processingToFinalizing: ms(timings.processing, timings.finalizing),
        finalizingToDone: ms(timings.finalizing, timings.completed),
        total: ms(timings.started, timings.completed),
      },
      environment: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemory: (navigator as { deviceMemory?: number }).deviceMemory ?? null,
        offscreenCanvas: typeof OffscreenCanvas !== "undefined",
        webWorker: typeof Worker !== "undefined",
      },
    },
    null,
    2
  );
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
