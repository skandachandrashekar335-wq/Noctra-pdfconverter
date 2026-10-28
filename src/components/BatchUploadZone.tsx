"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import {
  CONVERSION_PROFILES,
  DEFAULT_CONVERSION_PROFILE,
  type ConversionProfileId,
} from "@/lib/conversion-profiles";
import {
  deriveOutputFileName,
  runConversion,
  validateFile,
} from "@/lib/conversion";
import type { ConversionStatus } from "@/types";
import { revokeObjectUrl } from "@/lib/temp-resources";
import {
  createOutputResourceRegistry,
  type OutputResourceRegistry,
} from "@/lib/output-resources";

type BatchStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

interface BatchItem {
  id: string;
  file: File;
  status: BatchStatus;
  progress: number;
  message?: string;
  outputUrl?: string;
  outputName?: string;
  /**
   * History record id of this item's first attempt, when known. A retry
   * reuses it so failure + retry produces one history entry, not two.
   */
  historyId?: string;
  /**
   * Per-document theme override. Absent means "follow the batch default",
   * so changing the batch select still affects every unpinned item.
   */
  profile?: ConversionProfileId;
}

const CONCURRENCY = 2;
const MAX_BATCH_ITEMS = 20;

/** Registry key that owns one batch item's output URL. */
const itemKey = (id: string) => `item:${id}`;
/** Registry key that owns the prepared ZIP's URL. */
const ZIP_KEY = "zip";

export function BatchUploadZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [profile, setProfile] = useState<ConversionProfileId>(DEFAULT_CONVERSION_PROFILE);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipName, setZipName] = useState("noctra-batch.zip");
  const [zipPreparing, setZipPreparing] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const controllersRef = useRef(new Map<string, AbortController>());
  const cancelledIdsRef = useRef(new Set<string>());
  const historyErrorsRef = useRef(new Set<string>());
  const mountedRef = useRef(true);

  // Owns every object URL this panel renders: per-item outputs and the
  // prepared ZIP. A download only *marks* a URL — it never revokes it — so a
  // downloaded item keeps its visible Download link and stays inside the ZIP
  // set. URLs are released on retry, reset, replacement or unmount.
  // Lazy state (not a ref) keeps the registry stable across renders without
  // reading a ref during render.
  const [resources] = useState<OutputResourceRegistry>(createOutputResourceRegistry);

  const completed = useMemo(() => items.filter((item) => item.status === "completed" && item.outputUrl), [items]);
  const finished = items.filter((item) => item.status === "completed" || item.status === "failed" || item.status === "cancelled").length;

  useEffect(() => () => {
    mountedRef.current = false;
    controllersRef.current.forEach((controller) => controller.abort());
    resources.releaseAll();
  }, [resources]);

  const addFiles = useCallback((files: File[]) => {
    const next = files.map((file, index): BatchItem => {
      const validationError = validateFile(file);
      return {
        id: `${file.name}-${file.lastModified}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        status: validationError ? "failed" : "queued",
        progress: 0,
        message: validationError ?? undefined,
      };
    });
    const merged = [...items, ...next];
    if (merged.length > MAX_BATCH_ITEMS) {
      // Items past the cap are never rendered, so anything they already
      // produced must be released rather than left alive in the registry.
      merged.slice(MAX_BATCH_ITEMS).forEach((dropped) => resources.release(itemKey(dropped.id)));
    }
    setItems(merged.slice(0, MAX_BATCH_ITEMS));
    setZipError(null);
    // A newly added file invalidates the previously prepared ZIP.
    resources.release(ZIP_KEY);
    setZipUrl(null);
  }, [items, resources]);

  const updateItem = useCallback(
    (id: string, update: Partial<BatchItem> | ((current: BatchItem) => Partial<BatchItem>)) => {
      if (!mountedRef.current) return;
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, ...(typeof update === "function" ? update(item) : update) }
            : item
        )
      );
    },
    []
  );

  const processItem = useCallback(async (item: BatchItem) => {
    if (cancelledIdsRef.current.has(item.id)) return;
    const controller = new AbortController();
    controllersRef.current.set(item.id, controller);
    updateItem(item.id, { status: "processing", progress: 2, message: "Preparing…" });
    await runConversion(
      item.file,
      {
        // Per-document override wins; otherwise the batch default applies at
        // start time, so late default changes still reach unpinned items.
        profile: item.profile ?? profile,
        signal: controller.signal,
        onStatusChange: (status: ConversionStatus) => {
          if (status === "processing") updateItem(item.id, { progress: 8, message: "Analysing document…" });
        },
        onPhase: (phase) => {
          if (phase === "finalizing") {
            updateItem(item.id, (current) => ({
              status: "processing",
              progress: Math.max(current.progress, 90),
              message: "Finalizing…",
            }));
          }
        },
        onProgress: (page, total) => updateItem(item.id, {
          // Page progress owns 10–90%; finalization owns 92–99%.
          progress: Math.round(10 + (page / total) * 80),
          message: `Processing ${page} of ${total}…`,
        }),
        onFinalizing: (label) =>
          updateItem(item.id, (current) => ({
            status: "processing",
            progress: Math.min(99, Math.max(current.progress + 2, 92)),
            message: label,
          })),
        onConversionId: (id) => updateItem(item.id, { historyId: id }),
        onComplete: (outputUrl) => {
          if (!mountedRef.current || controllersRef.current.get(item.id) !== controller) {
            revokeObjectUrl(outputUrl);
            return;
          }
          // The item's Download link and the ZIP builder both keep consuming
          // this URL, so it is owned by the registry until retry/reset/unmount.
          resources.retain(itemKey(item.id), outputUrl);
          updateItem(item.id, {
            status: "completed",
            progress: 100,
            message: "Complete",
            outputUrl,
            outputName: deriveOutputFileName(item.file.name),
          });
        },
        onError: (message) => updateItem(item.id, { status: "failed", progress: 0, message }),
        onCancelled: () => updateItem(item.id, { status: "cancelled", progress: 0, message: "Cancelled" }),
        // History problems are advisory: the converted file is fine, so they
        // surface as a calm note rather than failing the batch item.
        onHistoryError: (message) => {
          if (!mountedRef.current || historyErrorsRef.current.has(message)) return;
          historyErrorsRef.current.add(message);
          setHistoryError(message);
        },
      },
      // Retry reuses this item's existing history record (when known) so
      // failure + retry adds no duplicate entry.
      item.historyId ? { historyId: item.historyId } : {}
    );
    controllersRef.current.delete(item.id);
  }, [profile, resources, updateItem]);

  const start = useCallback(async () => {
    if (running) return;
    const queue = items.filter((item) => item.status === "queued");
    if (queue.length === 0) return;
    setRunning(true);
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        if (cancelledIdsRef.current.has(item.id)) continue;
        await processItem(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    if (mountedRef.current) setRunning(false);
  }, [items, processItem, running]);

  function cancelItem(item: BatchItem) {
    if (item.status === "queued") {
      cancelledIdsRef.current.add(item.id);
      updateItem(item.id, { status: "cancelled", message: "Cancelled" });
      return;
    }
    controllersRef.current.get(item.id)?.abort();
  }

  function retryItem(item: BatchItem) {
    cancelledIdsRef.current.delete(item.id);
    // A retry replaces this item's output, so the old URL is released now —
    // it no longer has any consumer.
    resources.release(itemKey(item.id));
    updateItem(item.id, { status: "queued", progress: 0, message: undefined, outputUrl: undefined, outputName: undefined });
  }

  const createZip = useCallback(async () => {
    if (zipPreparing || completed.length === 0) return;
    setZipPreparing(true);
    setZipError(null);
    // Individual downloads no longer interfere: the registry keeps every
    // item's URL alive regardless of how often it was downloaded.
    const selected = [...completed];
    const zip = new JSZip();
    const usedNames = new Set<string>();
    try {
      for (const item of selected) {
        if (!item.outputUrl) continue;
        const response = await fetch(item.outputUrl);
        const bytes = await response.arrayBuffer();
        const base = item.outputName ?? deriveOutputFileName(item.file.name);
        let name = base;
        let suffix = 2;
        while (usedNames.has(name)) {
          const dot = base.lastIndexOf(".");
          name = `${base.slice(0, dot)}-${suffix++}${base.slice(dot)}`;
        }
        usedNames.add(name);
        zip.file(name, bytes);
      }
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      if (!mountedRef.current) return;
      // Retaining under the ZIP key releases any previously prepared ZIP.
      const nextZipUrl = URL.createObjectURL(blob);
      resources.retain(ZIP_KEY, nextZipUrl);
      setZipUrl(nextZipUrl);
      setZipName(`noctra-batch-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (error) {
      console.error("Batch ZIP creation failed:", error);
      if (mountedRef.current) setZipError("The ZIP could not be prepared. Individual downloads remain available.");
    } finally {
      if (mountedRef.current) setZipPreparing(false);
    }
  }, [completed, resources, zipPreparing]);

  function handleItemDownload(item: BatchItem) {
    if (!item.outputUrl) return;
    // Record the dispatch so a later release grants the in-flight download
    // its grace period. The URL is not revoked here and the item keeps its
    // Download link and its place in the ZIP set.
    resources.markDownloaded(itemKey(item.id));
  }

  function handleZipDownload() {
    if (!zipUrl) return;
    resources.markDownloaded(ZIP_KEY);
  }

  function reset() {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    cancelledIdsRef.current.clear();
    historyErrorsRef.current.clear();
    resources.releaseAll();
    setHistoryError(null);
    setItems([]);
    setZipUrl(null);
    setZipError(null);
    setZipPreparing(false);
  }

  return (
    <div className="batch-root">
      <div
        className={`batch-drop ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles([...event.dataTransfer.files]); }}
      >
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.pptx" className="sr-only" onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.target.value = ""; }} />
        <div>
          <p className="batch-title">Batch workspace</p>
          <p className="batch-sub">Queue up to 20 PDF, DOCX or PPTX files. Two files process at a time to keep the browser responsive.</p>
        </div>
        <div className="batch-actions">
          <button type="button" className="noctra-btn-secondary" onClick={() => inputRef.current?.click()}>Choose files</button>
          <label className="batch-profile">
            <span>Default theme</span>
            <select value={profile} onChange={(event) => setProfile(event.target.value as ConversionProfileId)} disabled={running}>
              {CONVERSION_PROFILES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {items.length > 0 && (
        <div className="batch-panel">
          <div className="batch-head">
            <div><strong>{finished}/{items.length}</strong> finished</div>
            <div className="batch-head-actions">
              <button type="button" className="noctra-btn-primary" onClick={start} disabled={running || !items.some((item) => item.status === "queued")}>{running ? "Processing…" : "Start batch"}</button>
              <button type="button" className="noctra-btn-secondary" onClick={reset} disabled={running}>Clear</button>
            </div>
          </div>
          <ul className="batch-list">
            {items.map((item) => (
              <li key={item.id} className="batch-item">
                <div className="batch-item-main">
                  <span className="batch-ext">{item.file.name.split(".").pop()?.toUpperCase()}</span>
                  <span className="batch-name">{item.file.name}</span>
                  {item.status === "queued" && (
                    <select
                      className="batch-item-profile"
                      value={item.profile ?? profile}
                      onChange={(event) =>
                        updateItem(item.id, {
                          profile: event.target.value as ConversionProfileId,
                        })
                      }
                      aria-label={`Dark theme for ${item.file.name}`}
                    >
                      {CONVERSION_PROFILES.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  )}
                  <span className={`batch-status batch-status--${item.status}`}>{item.message ?? item.status}</span>
                </div>
                {item.status === "processing" && <div className="batch-progress"><span style={{ width: `${item.progress}%` }} /></div>}
                {item.status === "completed" && item.outputUrl && <a className="batch-download" href={item.outputUrl} download={item.outputName} onClick={() => handleItemDownload(item)}>Download</a>}
                {(item.status === "queued" || item.status === "processing") && <button type="button" className="batch-item-action" onClick={() => cancelItem(item)}>Cancel</button>}
                {(item.status === "failed" || item.status === "cancelled") && <button type="button" className="batch-item-action" onClick={() => retryItem(item)}>Retry</button>}
              </li>
            ))}
          </ul>
          {completed.length > 0 && (
            <div className="batch-footer">
              <button type="button" className="noctra-btn-secondary" onClick={createZip} disabled={zipPreparing}>{zipPreparing ? "Preparing ZIP…" : `Prepare ZIP (${completed.length})`}</button>
              {zipUrl && <a className="noctra-btn-primary" href={zipUrl} download={zipName} onClick={handleZipDownload}>Download ZIP</a>}
              {zipError && <span className="batch-zip-error" role="alert">{zipError}</span>}
            </div>
          )}
          {/* Advisory only — the converted files above genuinely succeeded,
              so this is a note, not an alert, and never role="alert". */}
          {historyError && (
            <p className="batch-history-note" role="status" aria-live="polite">
              Some conversions finished but could not be added to your history. {historyError}
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .batch-root { display: grid; gap: 16px; margin-top: 16px; }
        .batch-drop, .batch-panel { border: 1px solid var(--border-default); border-radius: var(--radius-xl); background: var(--bg-surface); }
        .batch-drop { display: grid; gap: 20px; padding: 24px; transition: border-color var(--transition-base), background var(--transition-base); }
        .batch-drop.is-dragging { border-color: var(--accent-purple); background: var(--accent-purple-dim); }
        .batch-title { font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; letter-spacing: -0.04em; text-transform: uppercase; }
        .batch-sub { max-width: 64ch; color: var(--text-secondary); font-size: .875rem; line-height: 1.55; margin-top: 6px; }
        .batch-actions, .batch-head, .batch-head-actions, .batch-footer { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .batch-profile { display: inline-flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: .75rem; }
        .batch-profile select { min-height: 42px; border: 1px solid var(--border-default); border-radius: var(--radius-pill); background: var(--bg-base); color: var(--text-primary); padding: 0 12px; font: inherit; }
        .batch-panel { padding: 20px; }
        .batch-head { justify-content: space-between; color: var(--text-muted); font-size: .8125rem; }
        .batch-head strong { color: var(--text-primary); }
        .batch-list { list-style: none; display: grid; gap: 8px; margin-top: 16px; }
        .batch-item { padding: 12px; border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-elevated); }
        .batch-item-main { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .batch-ext { flex-shrink: 0; font-size: .625rem; font-weight: 700; letter-spacing: .1em; color: var(--text-muted); }
        .batch-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .875rem; }
        .batch-status { flex-shrink: 0; font-size: .6875rem; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); }
        .batch-item-profile { flex-shrink: 0; min-height: 28px; border: 1px solid var(--border-default); border-radius: var(--radius-pill); background: var(--bg-base); color: var(--text-primary); font: inherit; font-size: .6875rem; padding: 0 8px; }
        .batch-status--completed { color: var(--accent-ok); } .batch-status--failed { color: var(--accent-bad); } .batch-status--cancelled { color: var(--accent-warn); }
        .batch-progress { height: 3px; background: var(--border-subtle); margin-top: 10px; } .batch-progress span { display: block; height: 100%; background: var(--accent-purple); transition: width .2s ease; }
        .batch-download { display: inline-block; margin-top: 10px; color: var(--accent-purple); font-size: .75rem; }
        .batch-item-action { margin-left: 8px; border: 0; background: transparent; color: var(--text-muted); cursor: pointer; font: inherit; font-size: .6875rem; }
        .batch-item-action:hover { color: var(--accent-purple); }
        .batch-footer { justify-content: flex-end; margin-top: 16px; }
        .batch-history-note { margin-top: 12px; color: var(--text-muted); font-size: .75rem; line-height: 1.55; }
        @media (max-width: 600px) { .batch-item-main { align-items: flex-start; flex-wrap: wrap; } .batch-status { margin-left: 34px; } }
      `}</style>
    </div>
  );
}
