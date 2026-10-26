/**
 * Noctra conversion orchestrator — runs in the browser.
 *
 * Flow:
 *  1. Validate file type and size
 *  2. Start the history record in the background (status: pending) — the
 *     conversion never waits on it. Any storage backend can stall or be
 *     offline, which used to freeze the UI at 5% "Preparing…".
 *  3. Run the appropriate converter in-browser (PDF.js / JSZip)
 *  4. Queue the result / error onto the history record
 *  5. Return download URL (data URL for files ≤ 10 MB)
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
import type { ConversionStatus } from "@/types";

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

export interface ConversionCallbacks {
  onStatusChange?: (status: ConversionStatus) => void;
  onProgress?: (page: number, total: number) => void;
  onComplete?: (outputDataUrl: string, conversionId: string) => void;
  onError?: (error: string) => void;
  /**
   * Called when the conversion succeeded but its history record could not be
   * saved. Deliberately separate from `onError`: the download is fine, only
   * the saved history is missing, and saying "conversion failed" would be a
   * lie.
   */
  onHistoryError?: (message: string) => void;
}

/** Injectable collaborators, for tests only. */
export interface ConversionDeps {
  /**
   * Overrides the history backend. Passing `null` disables history entirely;
   * leaving it undefined uses the real Supabase-backed store. Tests use this
   * to simulate a backend that never settles — the original "stuck at 5%"
   * bug — without needing a live database.
   */
  historyStore?: HistoryStore | null;
}

export async function runConversion(
  file: File,
  callbacks: ConversionCallbacks = {},
  deps: ConversionDeps = {}
): Promise<void> {
  const { onStatusChange, onProgress, onComplete, onError, onHistoryError } =
    callbacks;

  const validationError = validateFile(file);
  if (validationError) {
    onError?.(validationError);
    return;
  }

  const fileType = detectFileType(file);

  // History is best-effort and must NEVER block the conversion. The tracker
  // starts creation in the background and serialises status writes behind it,
  // so a slow or absent backend cannot stall the UI.
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
        if (reported) return;
        reported = true;
        console.warn(message);
        onHistoryError?.(message);
      };
    })()
  );

  // Helper to update UI status and queue the matching history write.
  function updateStatus(
    status: ConversionStatus,
    extra: HistoryPayload = {}
  ) {
    onStatusChange?.(status);
    history.submit(status, extra);
  }

  try {
    updateStatus("processing");

    // 2. Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 3. Run appropriate converter
    let outputBytes: Uint8Array;
    let outputMimeType: string;
    let pageCount: number | undefined;

    if (fileType === "pdf") {
      const { convertPdfToDarkMode } = await import("@/lib/pdf-converter");
      outputBytes = await convertPdfToDarkMode(arrayBuffer, (page, total) => {
        pageCount = total;
        onProgress?.(page, total);
      });
      outputMimeType = "application/pdf";
    } else if (fileType === "pptx") {
      const { convertPptxToDarkMode } = await import("@/lib/pptx-converter");
      outputBytes = await convertPptxToDarkMode(
        arrayBuffer,
        (slide, total) => {
          pageCount = total;
          onProgress?.(slide, total);
        }
      );
      outputMimeType =
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    } else {
      const { convertDocxToDarkMode } = await import("@/lib/docx-converter");
      outputBytes = await convertDocxToDarkMode(arrayBuffer, (part, total) => {
        onProgress?.(part, total);
      });
      outputMimeType =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    // 4. Convert to blob URL for download. Kept in memory only — document
    //    binaries are never stored in the history table.
    // Slice to a plain ArrayBuffer to satisfy Blob's BlobPart type constraint
    const outputBuffer = outputBytes.buffer.slice(
      outputBytes.byteOffset,
      outputBytes.byteOffset + outputBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([outputBuffer], { type: outputMimeType });
    const outputDataUrl = URL.createObjectURL(blob);

    // Record minimal metadata in history (not the binary — too large).
    // The id may not exist yet if creation was slow; the payload function
    // receives it once known, so fields derived from it still land correctly.
    const conversionId = history.currentId() ?? "local-pending";
    updateStatus("completed", {
      pageCount,
      outputFileName: deriveOutputFileName(file.name),
    });

    onComplete?.(outputDataUrl, conversionId);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Conversion failed unexpectedly.";
    console.error("Conversion error:", error);
    updateStatus("failed", { errorMessage: msg });
    onError?.(msg);
  }
}
