"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentKeyFromBytes } from "@/lib/document-key";
import { hasUsableText, runClientOcr, type OcrPageProgress } from "@/lib/ocr";
import {
  deleteReaderAnnotation,
  fetchReaderState,
  saveReaderAnnotation,
  saveReaderPreferences,
  runStudyRequest,
} from "@/lib/reader-api";
import type { StudyTask } from "@/lib/ai-study";
import type {
  ReaderAnnotation,
  ReaderPreferences,
  ReaderRect,
  ReaderTheme,
} from "@/types";

interface PDFReaderProps {
  sourceUrl: string;
  fileName: string;
  onClose?: () => void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}

interface PdfPageLike {
  getViewport(options: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<unknown>;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
    transform?: [number, number, number, number, number, number];
  }): { promise: Promise<void>; cancel?: () => void };
}

interface TextLayerLike {
  render(): Promise<void>;
  cancel(): void;
}

const DEFAULT_PREFERENCES: Omit<ReaderPreferences, "documentKey" | "updatedAt"> = {
  pageNumber: 1,
  zoom: 1,
  theme: "night",
};

export function PDFReader({ sourceUrl, fileName, onClose }: PDFReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pageSurfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDocumentLike | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const textLayerInstanceRef = useRef<TextLayerLike | null>(null);
  const documentKeyRef = useRef<string | null>(null);
  const renderScaleRef = useRef(1);
  const [pdf, setPdf] = useState<PdfDocumentLike | null>(null);
  const [pageNumber, setPageNumber] = useState(DEFAULT_PREFERENCES.pageNumber);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_PREFERENCES.zoom);
  const [fitWidth, setFitWidth] = useState(true);
  const [theme, setTheme] = useState<ReaderTheme>(DEFAULT_PREFERENCES.theme);
  const [stageWidth, setStageWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [scannedPages, setScannedPages] = useState<number[]>([]);
  const [annotations, setAnnotations] = useState<ReaderAnnotation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPages, setSearchPages] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [selectedText, setSelectedText] = useState("");
  const [selectedRects, setSelectedRects] = useState<ReaderRect[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [currentPageText, setCurrentPageText] = useState("");
  const [ocrTextMap, setOcrTextMap] = useState<Record<number, string>>({});
  const [ocrProgressMap, setOcrProgressMap] = useState<Record<number, OcrPageProgress>>({});
  const [ocrBusy, setOcrBusy] = useState(false);
  const ocrTextRef = useRef<Record<number, string>>({});
  const [studyTask, setStudyTask] = useState<StudyTask>("summary");
  const [studyQuestion, setStudyQuestion] = useState("");
  const [studyConsent, setStudyConsent] = useState(false);
  const [studyBusy, setStudyBusy] = useState(false);
  const [studyAnswer, setStudyAnswer] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);

  const currentAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.pageNumber === pageNumber),
    [annotations, pageNumber]
  );
  const hasBookmark = currentAnnotations.some((annotation) => annotation.kind === "bookmark");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageWidth(stage.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PdfDocumentLike | null = null;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error("The document could not be opened.");
        const bytes = await response.arrayBuffer();
        const documentKey = await documentKeyFromBytes(bytes);
        documentKeyRef.current = documentKey;
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const loadingTask = pdfjs.getDocument({ data: bytes });
        loadedDocument = (await loadingTask.promise) as unknown as PdfDocumentLike;
        if (cancelled) {
          await loadedDocument.destroy();
          return;
        }
        pdfRef.current = loadedDocument;
        setPdf(loadedDocument);
        setPageCount(loadedDocument.numPages);
        void inspectTextCoverage(loadedDocument, setScannedPages, () => cancelled).catch(() => undefined);
        try {
          const stored = await fetchReaderState(documentKey);
          if (!cancelled) {
            if (stored.preferences) {
              setPageNumber(Math.min(stored.preferences.pageNumber, loadedDocument.numPages));
              setZoom(stored.preferences.zoom);
              setTheme(stored.preferences.theme);
            }
            setAnnotations(stored.annotations);
          }
        } catch {
          if (!cancelled) setStorageNotice("Reader notes are available locally for this session; persistent reader storage is not available yet.");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The PDF could not be opened.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      textLayerInstanceRef.current?.cancel();
      if (loadedDocument) void loadedDocument.destroy();
      pdfRef.current = null;
    };
  }, [sourceUrl]);

  async function inspectTextCoverage(document: PdfDocumentLike, setPages: (pages: number[]) => void, isCancelled: () => boolean) {
    const pages: number[] = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      const content = await document.getPage(page).then((value) => value.getTextContent()) as { items?: unknown[] };
      if (!hasUsableText(content.items ?? [])) pages.push(page);
      if (isCancelled()) return;
    }
    setPages(pages);
  }

  useEffect(() => {
    const canvasElement = canvasRef.current;
    const textLayerElement = textLayerRef.current;
    if (!pdf || !canvasElement || !textLayerElement || stageWidth === 0) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      renderTaskRef.current?.cancel?.();
      textLayerInstanceRef.current?.cancel();
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const fitScale = fitWidth ? Math.max(0.5, Math.min(2.5, (stageWidth - 40) / base.width)) : 1;
      const scale = fitScale * zoom;
      renderScaleRef.current = scale;
      const viewport = page.getViewport({ scale });
      const canvas = canvasElement;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * dpr);
      canvas.height = Math.ceil(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The browser could not create a PDF canvas.");
      const textLayer = textLayerElement;
      textLayer.innerHTML = "";
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      if (cancelled) return;
      const textContent = await page.getTextContent();
      const textItems = (textContent as { items?: Array<{ str?: string }> }).items ?? [];
      const nativeText = textItems.map((item) => item.str ?? "").join(" ").trim();
      const combinedText = nativeText || ocrTextRef.current[pageNumber] || "";
      setCurrentPageText(combinedText);
      const pdfjs = await import("pdfjs-dist");
      const TextLayer = (pdfjs as unknown as { TextLayer: new (options: { textContentSource: unknown; container: HTMLElement; viewport: unknown }) => TextLayerLike }).TextLayer;
      if (TextLayer) {
        const layer = new TextLayer({ textContentSource: textContent, container: textLayer, viewport });
        textLayerInstanceRef.current = layer;
        await layer.render();
      }
    })().catch((cause) => {
      if (!cancelled && !(cause instanceof Error && /cancel/i.test(cause.message))) {
        setError(cause instanceof Error ? cause.message : "The page could not be rendered.");
      }
    }).finally(() => {
      if (!cancelled) setRendering(false);
    });
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel?.();
      textLayerInstanceRef.current?.cancel();
    };
  }, [fitWidth, pageNumber, pdf, stageWidth, zoom]);

  useEffect(() => {
    if (!documentKeyRef.current || !pdf || loading) return;
    const id = window.setTimeout(() => {
      void saveReaderPreferences({
        documentKey: documentKeyRef.current!,
        pageNumber,
        zoom,
        theme,
      }).catch(() => setStorageNotice("Reader changes are active for this session but could not be saved permanently."));
    }, 500);
    return () => window.clearTimeout(id);
  }, [loading, pageNumber, pdf, theme, zoom]);

  useEffect(() => {
    let cancelled = false;
    if (!pdf || !searchQuery.trim()) {
      const clearId = window.setTimeout(() => {
        if (cancelled) return;
        setSearchPages([]);
        setSearchIndex(0);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(clearId);
      };
    }
    (async () => {
      const matches: number[] = [];
      const needle = searchQuery.trim().toLocaleLowerCase();
      for (let page = 1; page <= pdf.numPages; page += 1) {
        const content = await (await pdf.getPage(page)).getTextContent() as { items?: Array<{ str?: string }> };
        const pageOcr = ocrTextRef.current[page] ?? "";
        const text = ((content.items ?? []).map((item) => item.str ?? "").join(" ") + " " + pageOcr).toLocaleLowerCase();
        if (text.includes(needle)) matches.push(page);
        if (cancelled) return;
      }
      setSearchPages(matches);
      setSearchIndex(0);
      if (matches[0]) setPageNumber(matches[0]);
    })();
    return () => { cancelled = true; };
  }, [pdf, searchQuery]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setPageNumber((value) => Math.min(pageCount, value + 1));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setPageNumber((value) => Math.max(1, value - 1));
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setFitWidth(false);
        setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2))));
      } else if (event.key === "-") {
        event.preventDefault();
        setFitWidth(false);
        setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))));
      } else if (event.key === "Home") {
        setPageNumber(1);
      } else if (event.key === "End") {
        setPageNumber(pageCount);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pageCount]);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    const pageSurface = pageSurfaceRef.current;
    if (!selection || !text || !pageSurface || selection.rangeCount === 0) {
      setSelectedText("");
      setSelectedRects([]);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!textLayerRef.current?.contains(range.commonAncestorContainer)) return;
    const bounds = pageSurface.getBoundingClientRect();
    const scale = renderScaleRef.current;
    const rects = [...range.getClientRects()].map((rect) => ({
      x: (rect.left - bounds.left) / scale,
      y: (rect.top - bounds.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    })).filter((rect) => rect.width > 0 && rect.height > 0);
    setSelectedText(text.slice(0, 1000));
    setSelectedRects(rects);
  }, []);

  async function toggleBookmark() {
    const existing = currentAnnotations.find((annotation) => annotation.kind === "bookmark");
    if (existing) {
      await deleteAnnotation(existing.id);
      return;
    }
    await createAnnotation({ kind: "bookmark" });
  }

  async function createAnnotation(input: { kind: ReaderAnnotation["kind"]; quote?: string; note?: string; rects?: ReaderRect[] }) {
    if (!documentKeyRef.current) return;
    setSavingAnnotation(true);
    try {
      const annotation = await saveReaderAnnotation({
        documentKey: documentKeyRef.current,
        pageNumber,
        ...input,
        color: input.kind === "highlight" ? "#f4d35e" : undefined,
      });
      setAnnotations((items) => [...items, annotation]);
      setSelectedText("");
      setSelectedRects([]);
      setNoteDraft("");
      window.getSelection()?.removeAllRanges();
    } catch {
      setStorageNotice("This reader annotation could not be saved. The document itself is still available.");
    } finally {
      setSavingAnnotation(false);
    }
  }

  async function deleteAnnotation(id: string) {
    try {
      await deleteReaderAnnotation(id);
      setAnnotations((items) => items.filter((annotation) => annotation.id !== id));
    } catch {
      setStorageNotice("This annotation could not be removed.");
    }
  }

  async function askStudyAssistant() {
    if (!documentKeyRef.current || !currentPageText || !studyConsent) return;
    setStudyBusy(true);
    setStudyAnswer(null);
    setStudyError(null);
    try {
      const result = await runStudyRequest({
        documentKey: documentKeyRef.current,
        task: studyTask,
        question: studyQuestion.trim() || undefined,
        consent: true,
        passages: [{ pageNumber, text: currentPageText.slice(0, 8000) }],
      });
      setStudyAnswer(`${result.answer}\n\nSource page${result.sourcePages.length === 1 ? "" : "s"}: ${result.sourcePages.join(", ")}`);
    } catch (cause) {
      setStudyError(cause instanceof Error ? cause.message : "The study assistant could not complete this request.");
    } finally {
      setStudyBusy(false);
    }
  }

  function searchNext() {
    if (searchPages.length === 0) return;
    const next = (searchIndex + 1) % searchPages.length;
    setSearchIndex(next);
    setPageNumber(searchPages[next]);
  }

  async function handleRunOcr() {
    const canvas = canvasRef.current;
    if (!canvas || ocrBusy) return;
    setOcrBusy(true);
    try {
      const result = await runClientOcr(canvas, pageNumber, (progress) => {
        setOcrProgressMap((prev) => ({ ...prev, [pageNumber]: progress }));
      });
      ocrTextRef.current[pageNumber] = result.text;
      setOcrTextMap((prev) => ({ ...prev, [pageNumber]: result.text }));
      setCurrentPageText((prev) => prev || result.text);
    } catch {
      setStorageNotice(`Optical character extraction for page ${pageNumber} was interrupted.`);
    } finally {
      setOcrBusy(false);
    }
  }

  const readerThemeClass = `reader-theme--${theme}`;

  return (
    <section ref={rootRef} className={`pdf-reader ${readerThemeClass}`} aria-label={`Reading ${fileName}`}>
      <header className="reader-header">
        <div className="reader-heading">
          <p className="reader-eyebrow">Document reader</p>
          <h2 className="reader-title">{fileName}</h2>
        </div>
        <div className="reader-actions">
          <button type="button" className="reader-button" onClick={() => setShowThumbnails((value) => !value)} aria-pressed={showThumbnails}>Thumbnails</button>
          <button type="button" className="reader-button" onClick={() => void rootRef.current?.requestFullscreen?.()}>Full screen</button>
          {onClose && <button type="button" className="reader-button reader-button--quiet" onClick={onClose}>Close reader</button>}
        </div>
      </header>

      <div className="reader-toolbar">
        <div className="reader-group">
          <button type="button" className="reader-icon-button" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1} aria-label="Previous page">←</button>
          <label className="reader-page-input"><span className="sr-only">Page number</span><input type="number" min={1} max={pageCount} value={pageNumber} onChange={(event) => setPageNumber(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))} /><span>/ {pageCount || "—"}</span></label>
          <button type="button" className="reader-icon-button" onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))} disabled={pageNumber >= pageCount} aria-label="Next page">→</button>
        </div>
        <div className="reader-group">
          <button type="button" className="reader-icon-button" onClick={() => { setFitWidth(false); setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2)))); }} aria-label="Zoom out">−</button>
          <span className="reader-zoom">{Math.round(zoom * 100)}%</span>
          <button type="button" className="reader-icon-button" onClick={() => { setFitWidth(false); setZoom((value) => Math.min(3, Number((value + 0.1).toFixed(2)))); }} aria-label="Zoom in">+</button>
          <button type="button" className={`reader-button ${fitWidth ? "is-active" : ""}`} onClick={() => setFitWidth(true)} aria-pressed={fitWidth}>Fit width</button>
        </div>
        <div className="reader-group reader-search-group">
          <label className="reader-search"><span className="sr-only">Search document text</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search text" /></label>
          <span className="reader-search-count">{searchQuery ? `${searchPages.length ? searchIndex + 1 : 0}/${searchPages.length}` : ""}</span>
          <button type="button" className="reader-icon-button" onClick={searchNext} disabled={searchPages.length === 0} aria-label="Next search result">↵</button>
        </div>
        <div className="reader-group reader-study-group">
          <button type="button" className={`reader-button ${hasBookmark ? "is-active" : ""}`} onClick={() => void toggleBookmark()} disabled={savingAnnotation}>{hasBookmark ? "Bookmarked" : "Bookmark page"}</button>
          <label className="reader-theme"><span className="sr-only">Reading theme</span><select value={theme} onChange={(event) => setTheme(event.target.value as ReaderTheme)}><option value="night">Night</option><option value="sepia">Sepia</option><option value="paper">Paper</option></select></label>
        </div>
      </div>

      {storageNotice && <p className="reader-notice" role="status">{storageNotice}</p>}
      {scannedPages.length > 0 && (
        <div className="reader-ocr-bar" role="region" aria-label="OCR options">
          <span className="reader-ocr-badge">
            {scannedPages.length} scanned page{scannedPages.length === 1 ? "" : "s"} detected
          </span>
          {scannedPages.includes(pageNumber) ? (
            <div className="reader-ocr-current">
              <span>Page {pageNumber} has no selectable text layer.</span>
              {ocrProgressMap[pageNumber]?.status === "processing" ? (
                <span className="reader-ocr-status">Processing OCR… {ocrProgressMap[pageNumber]?.progressPct ?? 0}%</span>
              ) : ocrTextMap[pageNumber] ? (
                <span className="reader-ocr-status reader-ocr-status--done">✓ OCR text ready ({ocrTextMap[pageNumber].length} characters)</span>
              ) : (
                <button
                  type="button"
                  className="reader-button reader-button--accent"
                  onClick={() => void handleRunOcr()}
                  disabled={ocrBusy}
                >
                  {ocrBusy ? "Extracting…" : "Extract text with OCR"}
                </button>
              )}
            </div>
          ) : (
            <span className="reader-ocr-status">Current page has selectable text.</span>
          )}
        </div>
      )}
      {error && <div className="reader-error" role="alert"><p>{error}</p><button type="button" className="reader-button" onClick={() => setError(null)}>Dismiss</button></div>}

      <div className="reader-body">
        {showThumbnails && pdf && <aside className="reader-thumbnails" aria-label="Page thumbnails">{Array.from({ length: pageCount }, (_, index) => <PDFThumbnail key={index + 1} pdf={pdf} pageNumber={index + 1} active={pageNumber === index + 1} onSelect={setPageNumber} />)}</aside>}
        <div ref={stageRef} className="reader-stage" onMouseUp={handleSelection} tabIndex={0}>
          {loading ? <div className="reader-loading" role="status">Opening document…</div> : pdf ? <div ref={pageSurfaceRef} className="reader-page-surface"><canvas ref={canvasRef} /><div ref={textLayerRef} className="textLayer" />{currentAnnotations.filter((annotation) => annotation.kind === "highlight").flatMap((annotation) => (annotation.rects ?? []).map((rect, index) => <span key={`${annotation.id}-${index}`} className="reader-highlight" style={{ left: rect.x * renderScaleRef.current, top: rect.y * renderScaleRef.current, width: rect.width * renderScaleRef.current, height: rect.height * renderScaleRef.current }} />))}{selectedRects.map((rect, index) => <span key={`selection-${index}`} className="reader-highlight reader-highlight--pending" style={{ left: rect.x * renderScaleRef.current, top: rect.y * renderScaleRef.current, width: rect.width * renderScaleRef.current, height: rect.height * renderScaleRef.current }} />)}</div> : null}
          {rendering && !loading && <span className="reader-rendering" role="status">Rendering page…</span>}
        </div>
        <aside className="reader-notes" aria-label="Study notes">
          <div className="reader-notes-head"><p className="reader-eyebrow">Study tools</p><p className="reader-notes-page">Page {pageNumber}</p></div>
          {selectedText && <div className="reader-selection-card"><p className="reader-card-label">Selected text</p><blockquote>{selectedText}</blockquote><button type="button" className="reader-button reader-button--accent" onClick={() => void createAnnotation({ kind: "highlight", quote: selectedText, rects: selectedRects })} disabled={savingAnnotation}>Highlight selection</button></div>}
          <div className="reader-note-form"><label htmlFor="reader-note">Add a note</label><textarea id="reader-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Capture a thought about this page…" maxLength={4000} /><button type="button" className="reader-button reader-button--accent" disabled={!noteDraft.trim() || savingAnnotation} onClick={() => void createAnnotation({ kind: "note", note: noteDraft.trim() })}>Save note</button></div>
          <div className="reader-study-form"><div className="reader-study-title"><span className="reader-card-label">Study assistant</span><span className="reader-study-state">{currentPageText ? "Page text ready" : "No extracted text"}</span></div><label className="reader-study-field"><span className="sr-only">Study task</span><select value={studyTask} onChange={(event) => setStudyTask(event.target.value as StudyTask)}><option value="summary">Summarize this page</option><option value="key-points">Extract key points</option><option value="flashcards">Make flashcards</option><option value="quiz">Create practice questions</option><option value="explain">Explain this page</option></select></label><textarea value={studyQuestion} onChange={(event) => setStudyQuestion(event.target.value)} placeholder="Optional question or focus…" maxLength={2000} /><label className="reader-consent"><input type="checkbox" checked={studyConsent} onChange={(event) => setStudyConsent(event.target.checked)} /> <span>Allow this selected page text to be sent to the configured study provider.</span></label><button type="button" className="reader-button reader-button--accent" disabled={!currentPageText || !studyConsent || studyBusy} onClick={() => void askStudyAssistant()}>{studyBusy ? "Thinking…" : "Ask assistant"}</button>{studyAnswer && <p className="reader-study-answer">{studyAnswer}</p>}{studyError && <p className="reader-study-error" role="alert">{studyError}</p>}</div>
          <div className="reader-annotation-list">{annotations.length === 0 ? <p className="reader-empty">Bookmarks, notes and highlights will appear here.</p> : annotations.map((annotation) => <article key={annotation.id} className="reader-annotation"><div><span className="reader-card-label">{annotation.kind} · page {annotation.pageNumber}</span>{annotation.note && <p>{annotation.note}</p>}{annotation.quote && <blockquote>{annotation.quote}</blockquote>}</div><button type="button" className="reader-delete" onClick={() => void deleteAnnotation(annotation.id)} aria-label={`Delete ${annotation.kind} on page ${annotation.pageNumber}`}>×</button></article>)}</div>
        </aside>
      </div>

      <style jsx>{`
        .pdf-reader { --reader-bg: #111114; --reader-surface: #19191f; --reader-elevated: #1f1f27; --reader-text: #f2f2f2; --reader-muted: #a8a8b4; --reader-border: rgba(255,255,255,.13); --reader-accent: #7c6dff; display: grid; gap: 14px; min-height: 680px; padding: 18px; border: 1px solid var(--border-default); border-radius: var(--radius-xl); background: var(--reader-bg); color: var(--reader-text); }
        .reader-theme--sepia { --reader-bg: #2b241e; --reader-surface: #3b3026; --reader-elevated: #4a3a2e; --reader-text: #efe0c6; --reader-muted: #c7ad8c; --reader-border: rgba(239,224,198,.2); --reader-accent: #e2a65b; }
        .reader-theme--paper { --reader-bg: #e9e7e2; --reader-surface: #f5f3ef; --reader-elevated: #ffffff; --reader-text: #1a1a1a; --reader-muted: #626262; --reader-border: rgba(17,17,17,.18); --reader-accent: #5b4de0; }
        .reader-header, .reader-toolbar, .reader-body, .reader-group, .reader-actions, .reader-notes-head { display: flex; align-items: center; }
        .reader-header { justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .reader-heading { min-width: 0; }
        .reader-eyebrow, .reader-card-label { color: var(--reader-muted); font-size: .625rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
        .reader-title { margin-top: 5px; font-family: var(--font-display); font-size: clamp(1.25rem, 3vw, 2rem); letter-spacing: -.04em; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .reader-actions, .reader-group { gap: 7px; flex-wrap: wrap; }
        .reader-toolbar { gap: 12px; padding: 10px 0; border-top: 1px solid var(--reader-border); border-bottom: 1px solid var(--reader-border); flex-wrap: wrap; }
        .reader-button, .reader-icon-button, .reader-theme select, .reader-page-input, .reader-search input { min-height: 34px; border: 1px solid var(--reader-border); border-radius: var(--radius-pill); background: transparent; color: var(--reader-text); font: inherit; font-size: .6875rem; }
        .reader-button { padding: 0 12px; cursor: pointer; letter-spacing: .08em; text-transform: uppercase; }
        .reader-button:hover:not(:disabled), .reader-button.is-active { border-color: var(--reader-accent); color: var(--reader-accent); }
        .reader-button--accent { background: var(--reader-accent); border-color: var(--reader-accent); color: #fff; }
        .reader-button--quiet { color: var(--reader-muted); }
        .reader-button:disabled, .reader-icon-button:disabled { opacity: .45; cursor: not-allowed; }
        .reader-icon-button { width: 34px; padding: 0; cursor: pointer; font-size: 1rem; }
        .reader-page-input { display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; }
        .reader-page-input input { width: 38px; border: 0; outline: 0; background: transparent; color: inherit; text-align: center; font: inherit; }
        .reader-zoom, .reader-search-count { color: var(--reader-muted); font-size: .6875rem; min-width: 38px; text-align: center; }
        .reader-search { display: inline-flex; min-width: 150px; }
        .reader-search input { width: 100%; padding: 0 11px; border-radius: var(--radius-sm); }
        .reader-theme select { padding: 0 9px; }
        .reader-notice, .reader-error { padding: 10px 12px; border: 1px solid var(--reader-border); border-radius: var(--radius-md); color: var(--reader-muted); font-size: .75rem; line-height: 1.5; }
        .reader-ocr-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; border: 1px solid var(--reader-border); border-radius: var(--radius-md); background: var(--reader-surface); font-size: .75rem; flex-wrap: wrap; }
        .reader-ocr-badge { color: var(--reader-accent); font-weight: 600; font-size: .6875rem; text-transform: uppercase; letter-spacing: .08em; }
        .reader-ocr-current { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .reader-ocr-status { color: var(--reader-muted); font-size: .75rem; }
        .reader-ocr-status--done { color: #34d399; font-weight: 500; }
        .reader-error { display: flex; justify-content: space-between; gap: 12px; align-items: center; color: #f87171; }
        .reader-body { align-items: stretch; min-height: 560px; gap: 12px; }
        .reader-thumbnails { width: 92px; flex: 0 0 92px; display: grid; align-content: start; gap: 8px; max-height: 620px; overflow: auto; padding-right: 4px; }
        .reader-stage { position: relative; flex: 1; min-width: 0; min-height: 560px; display: flex; align-items: flex-start; justify-content: center; overflow: auto; padding: 20px; border: 1px solid var(--reader-border); border-radius: var(--radius-lg); background: var(--reader-surface); outline: none; }
        .reader-page-surface { position: relative; flex: 0 0 auto; box-shadow: 0 18px 40px rgba(0,0,0,.3); background: #fff; }
        .reader-page-surface canvas { display: block; }
        .reader-rendering { position: absolute; top: 10px; right: 12px; color: var(--reader-muted); font-size: .6875rem; }
        .reader-loading { align-self: center; color: var(--reader-muted); font-size: .875rem; }
        .reader-notes { width: 230px; flex: 0 0 230px; display: grid; align-content: start; gap: 14px; padding: 14px; border: 1px solid var(--reader-border); border-radius: var(--radius-lg); background: var(--reader-surface); overflow: auto; }
        .reader-notes-head { justify-content: space-between; gap: 8px; }
        .reader-notes-page { color: var(--reader-muted); font-size: .6875rem; }
        .reader-note-form, .reader-selection-card { display: grid; gap: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--reader-border); }
        .reader-note-form label { font-size: .75rem; color: var(--reader-text); }
        .reader-note-form textarea { min-height: 82px; resize: vertical; padding: 9px; border: 1px solid var(--reader-border); border-radius: var(--radius-md); background: var(--reader-elevated); color: var(--reader-text); font: inherit; font-size: .75rem; }
        .reader-study-form { display: grid; gap: 8px; padding-bottom: 14px; border-bottom: 1px solid var(--reader-border); }
        .reader-study-title { display: flex; justify-content: space-between; gap: 8px; }
        .reader-study-state { color: var(--reader-muted); font-size: .625rem; }
        .reader-study-field select, .reader-study-form textarea { width: 100%; min-height: 34px; padding: 8px; border: 1px solid var(--reader-border); border-radius: var(--radius-md); background: var(--reader-elevated); color: var(--reader-text); font: inherit; font-size: .75rem; }
        .reader-study-form textarea { min-height: 58px; resize: vertical; }
        .reader-consent { display: flex; gap: 7px; align-items: flex-start; color: var(--reader-muted); font-size: .625rem; line-height: 1.4; }
        .reader-study-answer, .reader-study-error { white-space: pre-wrap; color: var(--reader-text); font-size: .75rem; line-height: 1.5; }
        .reader-study-error { color: #f87171; }
        .reader-selection-card blockquote, .reader-annotation blockquote { margin: 0; color: var(--reader-muted); font-size: .75rem; line-height: 1.45; }
        .reader-annotation-list { display: grid; gap: 9px; }
        .reader-empty { color: var(--reader-muted); font-size: .75rem; line-height: 1.5; }
        .reader-annotation { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 9px; border: 1px solid var(--reader-border); border-radius: var(--radius-md); background: var(--reader-elevated); }
        .reader-annotation p { margin-top: 5px; font-size: .75rem; line-height: 1.45; }
        .reader-delete { border: 0; background: transparent; color: var(--reader-muted); cursor: pointer; font-size: 1.1rem; }
        .reader-highlight { position: absolute; z-index: 2; background: rgba(244,211,94,.42); pointer-events: none; }
        .reader-highlight--pending { z-index: 4; background: rgba(124,109,255,.25); outline: 1px dashed var(--reader-accent); }
        :global(.textLayer) { position: absolute; inset: 0; overflow: hidden; opacity: 1; line-height: 1; transform-origin: 0 0; z-index: 3; }
        :global(.textLayer span), :global(.textLayer br) { position: absolute; color: transparent; cursor: text; white-space: pre; transform-origin: 0 0; }
        :global(.textLayer ::selection) { background: rgba(124,109,255,.35); }
        @media (max-width: 1100px) { .reader-notes { width: 200px; flex-basis: 200px; } }
        @media (max-width: 820px) { .reader-body { display: grid; grid-template-columns: 1fr; } .reader-thumbnails { width: 100%; flex-basis: auto; grid-auto-flow: column; grid-auto-columns: 70px; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); max-height: 100px; } .reader-notes { width: auto; flex-basis: auto; } .reader-stage { min-height: 480px; } }
      `}</style>
    </section>
  );
}

function PDFThumbnail({ pdf, pageNumber, active, onSelect }: { pdf: PdfDocumentLike; pageNumber: number; active: boolean; onSelect: (page: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.14 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * dpr);
      canvas.height = Math.ceil(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({ canvasContext: context, viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
    })();
    return () => { cancelled = true; };
  }, [pageNumber, pdf]);
  return <button type="button" className={`reader-thumbnail ${active ? "is-active" : ""}`} onClick={() => onSelect(pageNumber)} aria-label={`Go to page ${pageNumber}`} aria-current={active ? "page" : undefined}><canvas ref={canvasRef} /><span>{pageNumber}</span><style jsx>{`.reader-thumbnail { display: grid; justify-items: center; gap: 3px; padding: 5px; border: 1px solid var(--reader-border); border-radius: var(--radius-sm); background: var(--reader-elevated); color: var(--reader-muted); cursor: pointer; font: inherit; font-size: .625rem; } .reader-thumbnail.is-active { border-color: var(--reader-accent); color: var(--reader-accent); } .reader-thumbnail canvas { max-width: 100%; height: auto; }`}</style></button>;
}
