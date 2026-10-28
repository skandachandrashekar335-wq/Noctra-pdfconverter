/**
 * Noctra conversion orchestrator — runs in the browser.
 *
 * Flow:
 *  1. Validate file type and size
 *  2. Emit the lifecycle: queued → processing → finalizing → terminal
 *     (`ConversionPhase`), separate from the persisted `ConversionStatus`
 *  3. Start the history record in the background (status: pending) — the
 *     conversion never waits on it. Any storage backend can stall or be
 *     offline, which used to freeze the UI at 5% "Preparing…".
 *  4. Run the appropriate converter in-browser (PDF.js / JSZip) behind an
 *     internal AbortSignal linked to the caller's signal
 *  5. Validate the produced bytes (format magic + parseable structure)
 *     BEFORE any success callback can fire — 100% means a real, openable file
 *  6. Queue the result / error onto the history record
 *  7. Return download URL (blob URL)
 *
 * Stall watchdog: every progress/finalizing tick resets a timer. If the
 * renderer stops responding entirely (a worker that never settles, a parse
 * loop inside PDF.js), the conversion fails with an actionable message
 * instead of sitting at 95% forever. The watchdog can never fire after a
 * terminal state, and a late-resolving converter cannot overwrite one.
 *
 * Why browser-side?  Vercel's serverless functions have a 10s timeout and
 * a 4 MB request body limit for Hobby plans, both too small for real documents.
 * Running the conversion in the browser avoids both limits and keeps the
 * architecture simple — the API layer only handles history writes, which need
 * server-side Firebase ID-token verification.
 *
 * Note the deliberate absence of a `userId` argument: the owner of a history
 * record is derived server-side from the verified Firebase token, never
 * supplied by the client.
 */

import { detectFileType, validateFile } from "@/lib/validation";
import { createHistoryTracker } from "@/lib/history-tracker";
import type { HistoryPayload, HistoryStore } from "@/lib/history-tracker";
import { createRemoteHistoryStore } from "@/lib/history-api";
import {
  validateConversionOutput,
  validateOutputBlob,
} from "@/lib/output-validation";
import type { ConversionPhase, ConversionStatus } from "@/types";
import type { ConversionProfileId } from "@/lib/conversion-profiles.ts";
import { getConversionProfile } from "@/lib/conversion-profiles.ts";

// Validation helpers live in a pure module so they can be unit tested
// without Firebase; re-exported here to preserve the public API.
export {
  MAX_FILE_SIZE_BYTES,
  SUPPORTED_TYPES,
  validateFile,
  detectFileType,
} from "@/lib/validation";

/**
 * Derive the output filename from the input name.
 *
 * Shared with the upload UI so the download attribute and the stored history
 * metadata can never disagree.
 */
export function deriveOutputFileName(fileName: string): string {
  return fileName.replace(/\.(pdf|docx|pptx)$/i, "-dark.$1");
}

/** Default stall timeout: no event for this long means the renderer is wedged. */
export const DEFAULT_STALL_TIMEOUT_MS = 120_000;

/**
 * Stage-scoped guard for output validation. Validation is a lazy structural
 * parse (pdf-lib / JSZip) that normally completes in well under a second even
 * for large outputs, but a stalled dynamic `import()` or a wedged parser can
 * leave the await pending forever — the "stuck at 96% Validating output…"
 * bug. The bound is deliberately generous (30s) so a slow-but-healthy parse of
 * a huge document is never killed; it exists only to convert genuinely stuck
 * work into an actionable, stage-specific error instead of a frozen card.
 */
export const DEFAULT_VALIDATION_TIMEOUT_MS = 30_000;

export interface ConversionCallbacks {
  profile?: ConversionProfileId;
  signal?: AbortSignal;
  onStatusChange?: (status: ConversionStatus) => void;
  /**
   * Runtime lifecycle. Fires for queued/processing/finalizing as well as the
   * terminal states — unlike `onStatusChange`, which reports what gets
   * persisted (`finalizing` is persisted as `processing`).
   */
  onPhase?: (phase: ConversionPhase) => void;
  /** Page/slide/part progress. Never fires for finalization work. */
  onProgress?: (page: number, total: number) => void;
  /**
   * Finalization sub-progress: labels like "Serializing PDF…" that cover the
   * work between the last page tick and a valid output. Fires while the phase
   * is `finalizing`.
   */
  onFinalizing?: (label: string) => void;
  /** The history record id, once known — used to reuse it on retry. */
  onConversionId?: (id: string) => void;
  /**
   * Third argument (PDF only): the measured quality report — real pixel
   * classification counts from the transform, never estimates.
   */
  onComplete?: (
    outputDataUrl: string,
    conversionId: string,
    quality?: ConversionQualityReport
  ) => void;
  onError?: (error: string) => void;
  /**
   * Called when the conversion succeeded but its history record could not be
   * saved. Deliberately separate from `onError`: the download is fine, only
   * the saved history is missing, and saying "conversion failed" would be a
   * lie.
   */
  onHistoryError?: (message: string) => void;
  onCancelled?: () => void;
}

/** Handlers a converter receives while it runs. */
export interface ConverterHandlers {
  onProgress: (page: number, total: number) => void;
  onFinalizing: (label: string) => void;
  profile?: ConversionProfileId;
  signal: AbortSignal;
}

/**
 * Measured quality report for a completed PDF conversion. Every field is
 * computed from the actual rendered pixels and output bytes.
 */
export interface ConversionQualityReport {
  profileId: ConversionProfileId;
  profileLabel: string;
  pages: number;
  /** Share of all pixels remapped to the dark background (paper → dark). */
  darkenedPct: number;
  /** Share of all pixels remapped to light text (ink → text). */
  textPct: number;
  /** Share of pixels preserved as colourful/photo content. */
  contentPct: number;
  /** Final serialized output size in bytes. */
  outputBytes: number;
}

export interface ConverterResult {
  bytes: Uint8Array;
  mimeType: string;
  /** Pages (PDF), slides (PPTX) or parts (DOCX) reported by the converter. */
  pageCount?: number;
  /** Present for PDF conversions: measured pixel classification stats. */
  quality?: ConversionQualityReport;
}

/** Signature of the format dispatch. Tests inject their own implementation. */
export type ConverterFn = (
  fileType: "pdf" | "docx" | "pptx",
  buffer: ArrayBuffer,
  handlers: ConverterHandlers
) => Promise<ConverterResult>;

/** Injectable collaborators, for tests only. */
export interface ConversionDeps {
  /**
   * Overrides the history backend. Passing `null` disables history entirely;
   * leaving it undefined uses the real Supabase-backed store. Tests use this
   * to simulate a backend that never settles — the original "stuck at 5%"
   * bug — without needing a live database.
   */
  historyStore?: HistoryStore | null;
  /**
   * Reuse an existing history record instead of creating a new one. The
   * retry path passes the failed attempt's id so a retry updates that record
   * rather than adding a duplicate entry.
   */
  historyId?: string;
  /** Milliseconds without any progress before the stall watchdog fails the
   * conversion. <= 0 disables the watchdog. Tests use small values. */
  stallTimeoutMs?: number;
  /** Overrides the format converter (tests only). */
  runConverter?: ConverterFn;
  /**
   * Overrides output validation (tests only). Defaults to the real
   * format-aware validator. A test uses this to reproduce a validation await
   * that never settles — the "stuck at 96%" bug.
   */
  validateOutput?: (
    data: Uint8Array,
    fileType: "pdf" | "docx" | "pptx",
    pageCount?: number
  ) => Promise<void>;
  /**
   * Stage-scoped timeout for output validation, in milliseconds. This is a
   * narrow last-resort guard: validation normally finishes in well under a
   * second, so the bound only trips when the validation await is genuinely
   * wedged (a stalled dynamic chunk fetch, a hung parser). It must be large
   * enough to never kill a slow-but-healthy parse of a large document.
   * <= 0 disables the stage guard (falls back to the global watchdog).
   */
  validationTimeoutMs?: number;
}

/** Default format dispatch — dynamic imports keep bundles split. */
const defaultConverter: ConverterFn = async (fileType, buffer, handlers) => {
  // Last total reported by the converter: pages (PDF) / slides (PPTX).
  // Used for output validation and the history pageCount.
  let reportedTotal: number | undefined;
  const track = (page: number, total: number) => {
    reportedTotal = total;
    handlers.onProgress(page, total);
  };

  if (fileType === "pdf") {
    const { convertPdfToDarkMode } = await import("@/lib/pdf-converter");
    const converted = await convertPdfToDarkMode(
      buffer,
      track,
      handlers.profile,
      handlers.signal,
      handlers.onFinalizing
    );
    const { stats, pages, profileId } = converted;
    const pct = (count: number) =>
      stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
    const quality: ConversionQualityReport = {
      profileId,
      profileLabel: getConversionProfile(profileId).label,
      pages,
      darkenedPct: pct(stats.paper),
      textPct: pct(stats.ink),
      contentPct: pct(stats.colourful),
      outputBytes: converted.bytes.byteLength,
    };
    return {
      bytes: converted.bytes,
      mimeType: "application/pdf",
      pageCount: reportedTotal ?? pages,
      quality,
    };
  }
  if (fileType === "pptx") {
    const { convertPptxToDarkMode } = await import("@/lib/pptx-converter");
    const bytes = await convertPptxToDarkMode(
      buffer,
      track,
      handlers.profile,
      handlers.signal,
      handlers.onFinalizing
    );
    return {
      bytes,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pageCount: reportedTotal,
    };
  }
  const { convertDocxToDarkMode } = await import("@/lib/docx-converter");
  const bytes = await convertDocxToDarkMode(
    buffer,
    track,
    handlers.profile,
    handlers.signal,
    handlers.onFinalizing
  );
  return {
    bytes,
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
};

/**
 * Yield one macrotask so the browser can paint pending UI (the finalizing
 * label) before a CPU-bound synchronous parse blocks the main thread. Without
 * this, the "Validating output…" frame is set and the main thread blocks on
 * the parse in the same tick, so the label never visibly renders and the card
 * looks frozen even while healthy work is running.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Race a promise against a stage-scoped timeout. On timeout, reject with an
 * error naming the stage so the UI can say *where* work stopped, not just
 * that something did. A settled input promise wins untouched.
 */
function withStageTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: string
): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `${stage} timed out after ${Math.round(timeoutMs / 1000)}s. ` +
            "The converted file could not be verified — try again, or try a smaller document."
        )
      );
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function runConversion(
  file: File,
  callbacks: ConversionCallbacks = {},
  deps: ConversionDeps = {}
): Promise<void> {
  const {
    onStatusChange,
    onPhase,
    onProgress,
    onFinalizing,
    onConversionId,
    onComplete,
    onError,
    onHistoryError,
    onCancelled,
  } = callbacks;

  const validationError = validateFile(file);
  if (validationError) {
    onPhase?.("failed");
    onError?.(validationError);
    return;
  }

  const fileType = detectFileType(file);

  // Terminal-state guard: once a conversion settles, no late progress tick,
  // watchdog fire or converter resolution may emit anything again.
  let settled = false;
  let finalizingStarted = false;

  // Internal signal: the caller's signal aborts it, and so does the stall
  // watchdog — giving cancellation a real object to stop work with.
  const controller = new AbortController();
  const externalSignal = callbacks.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  // History is best-effort and must NEVER block the conversion. The tracker
  // starts creation in the background and serialises status writes behind it,
  // so a slow or absent backend cannot stall the UI. On retry it adopts the
  // previous attempt's record (`deps.historyId`) instead of creating another.
  const history = createHistoryTracker(
    deps.historyStore === undefined ? createRemoteHistoryStore() : deps.historyStore,
    {
      originalFileName: file.name,
      originalFileSize: file.size,
      fileType,
      status: "pending",
    },
    // Surface history problems to the UI, but only once per conversion —
    // a failing backend would otherwise fire on every queued status write.
    (() => {
      let reported = false;
      return (message: string) => {
        if (reported || settled) return;
        reported = true;
        console.warn(message);
        onHistoryError?.(message);
      };
    })(),
    {
      ...(deps.historyId ? { initialId: deps.historyId } : {}),
      onCreated: (id) => onConversionId?.(id),
    }
  );
  // A retried run already knows its id; report it so the UI can chain
  // another retry without waiting on anything.
  if (deps.historyId) onConversionId?.(deps.historyId);

  // ── Stall watchdog ────────────────────────────────────────────────────
  const stallTimeoutMs = deps.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  const stopWatchdog = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = null;
  };
  const bumpWatchdog = () => {
    if (settled || stalled || stallTimeoutMs <= 0) return;
    stopWatchdog();
    stallTimer = setTimeout(() => {
      if (settled || stalled) return;
      stalled = true;
      // Stop the wedged work, then settle immediately so the UI unblocks
      // even if the converter never reacts to the abort.
      controller.abort();
      const message =
        "The converter stopped responding before the file was ready. " +
        "Nothing was saved — try again, or try a smaller document.";
      if (settle("failed", "failed", { errorMessage: message })) {
        onError?.(message);
      }
    }, stallTimeoutMs);
  };

  // ── Emission helpers (all gated on the terminal-state guard) ──────────
  function emitPhase(phase: ConversionPhase): void {
    if (settled) return;
    onPhase?.(phase);
  }

  function updateStatus(status: ConversionStatus, extra: HistoryPayload = {}): void {
    if (settled) return;
    onStatusChange?.(status);
    history.submit(status, extra);
  }

  /**
   * Move to a terminal state exactly once. Returns false when the conversion
   * had already settled (a duplicate completion must not overwrite a failure,
   * and a duplicate failure must not overwrite a completion).
   */
  function settle(
    phase: Extract<ConversionPhase, "completed" | "failed" | "cancelled">,
    status: ConversionStatus,
    extra: HistoryPayload = {}
  ): boolean {
    if (settled) return false;
    settled = true;
    stopWatchdog();
    onStatusChange?.(status);
    history.submit(status, extra);
    onPhase?.(phase);
    return true;
  }

  function ensureFinalizing(label: string): void {
    if (settled) return;
    if (!finalizingStarted) {
      finalizingStarted = true;
      onPhase?.("finalizing");
    }
    onFinalizing?.(label);
  }

  try {
    if (controller.signal.aborted) {
      throw new DOMException("Conversion cancelled.", "AbortError");
    }
    emitPhase("queued");
    updateStatus("processing");
    emitPhase("processing");
    bumpWatchdog();

    // 2. Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    if (controller.signal.aborted) {
      throw new DOMException("Conversion cancelled.", "AbortError");
    }
    bumpWatchdog();

    // 3. Run the format converter behind the linked signal.
    const converter = deps.runConverter ?? defaultConverter;
    let result: ConverterResult;
    try {
      result = await converter(fileType, arrayBuffer, {
        onProgress: (page, total) => {
          if (settled) return;
          bumpWatchdog();
          onProgress?.(page, total);
        },
        onFinalizing: (label) => {
          if (settled) return;
          bumpWatchdog();
          ensureFinalizing(label);
        },
        profile: callbacks.profile,
        signal: controller.signal,
      });
    } catch (error) {
      // The watchdog already settled this conversion: the converter is only
      // now reacting to the abort it triggered. Do not emit anything.
      if (settled) return;
      if (stalled) return;
      throw error;
    }

    if (settled) return;
    if (controller.signal.aborted) {
      throw new DOMException("Conversion cancelled.", "AbortError");
    }

    // 4. Finalizing is visible even when the converter emits no labels of
    //    its own — validation runs under the finalizing phase.
    ensureFinalizing("Validating output…");
    bumpWatchdog();

    // 5. A conversion is only successful if the bytes actually open as the
    //    format they claim to be. Validation failures take the error path.
    //
    //    Two guards keep this phase from wedging the card at "Validating
    //    output…" (the observed "stuck at 96%" bug):
    //      a) Yield one macrotask BEFORE the CPU-bound parse so the browser
    //         actually paints the finalizing label instead of blocking the
    //         main thread the instant the label is set.
    //      b) A stage-scoped timeout around the validation await. A stalled
    //         dynamic import() or hung parser becomes a validation-specific,
    //         actionable error rather than a frozen progress bar that only
    //         the generic 120s watchdog could (vaguely) unblock.
    const validate =
      deps.validateOutput ??
      ((data, type, pages) => validateConversionOutput(data, type, pages));
    await yieldToEventLoop();
    if (settled) return;
    if (controller.signal.aborted) {
      throw new DOMException("Conversion cancelled.", "AbortError");
    }
    const validationTimeoutMs =
      deps.validationTimeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS;
    try {
      await withStageTimeout(
        validate(result.bytes, fileType, result.pageCount),
        validationTimeoutMs,
        "Output validation"
      );
    } catch (err) {
      // Surface the stage so the message names where it failed, but keep a
      // cancellation distinguishable from a genuine validation failure.
      if (err instanceof Error && err.name === "AbortError") throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        detail.startsWith("Output validation")
          ? detail
          : `Output validation failed: ${detail}`
      );
    }
    if (settled) return;
    if (controller.signal.aborted) {
      throw new DOMException("Conversion cancelled.", "AbortError");
    }

    const outputBuffer = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([outputBuffer], { type: result.mimeType });
    validateOutputBlob(blob);
    const outputDataUrl = URL.createObjectURL(blob);

    // Record minimal metadata in history (not the binary — too large).
    // The id may not exist yet if creation was slow; the payload function
    // receives it once known, so fields derived from it still land correctly.
    const conversionId = history.currentId() ?? "local-pending";
    if (
      !settle("completed", "completed", {
        pageCount: result.pageCount,
        outputFileName: deriveOutputFileName(file.name),
      })
    ) {
      // Settled while validating (watchdog/user): the URL must not leak.
      URL.revokeObjectURL(outputDataUrl);
      return;
    }
    onComplete?.(outputDataUrl, conversionId, result.quality);
  } catch (error) {
    if (settled) return;
    const wasCancelled =
      externalSignal?.aborted === true ||
      (!stalled &&
        (controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")));
    if (wasCancelled) {
      if (settle("cancelled", "cancelled", { errorMessage: "Conversion cancelled." })) {
        onCancelled?.();
      }
      return;
    }
    const msg =
      error instanceof Error ? error.message : "Conversion failed unexpectedly.";
    console.error("Conversion error:", error);
    if (settle("failed", "failed", { errorMessage: msg })) {
      onError?.(msg);
    }
  } finally {
    stopWatchdog();
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}
