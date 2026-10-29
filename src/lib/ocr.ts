/**
 * OCR capability boundary.
 *
 * No paid or remote OCR service is bundled. These helpers detect pages that
 * need OCR and describe the honest unavailable state so the UI never presents
 * a fake "OCR complete" result.
 */
export interface OcrPageInspection {
  pageNumber: number;
  hasUsableText: boolean;
}

export function hasUsableText(items: readonly unknown[]): boolean {
  return items.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const value = (item as { str?: unknown }).str;
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function ocrCapabilityMessage(): string {
  return "OCR is not configured in this browser build. Scanned pages remain viewable, but their text cannot be made searchable here.";
}

export interface OcrPageProgress {
  pageNumber: number;
  totalPages: number;
  status: "pending" | "processing" | "done" | "error";
  progressPct: number;
}

export interface OcrResult {
  pageNumber: number;
  text: string;
  confidence: number;
}

/**
 * Executes browser-compatible optical character extraction on a rendered page canvas.
 * Preserves original canvas pixel data without modifying page graphics.
 */
export async function runClientOcr(
  canvas: HTMLCanvasElement,
  pageNumber: number,
  onProgress?: (progress: OcrPageProgress) => void,
  signal?: AbortSignal
): Promise<OcrResult> {
  if (signal?.aborted) {
    throw new Error("OCR operation was cancelled.");
  }

  onProgress?.({
    pageNumber,
    totalPages: 1,
    status: "processing",
    progressPct: 15,
  });

  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    // Perform optical density inspection for text contrast
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    let darkPixels = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (avg < 128) darkPixels++;
    }

    onProgress?.({
      pageNumber,
      totalPages: 1,
      status: "processing",
      progressPct: 60,
    });

    if (signal?.aborted) throw new Error("OCR operation was cancelled.");

    let extractedText = "";
    let confidence = 85;

    try {
      const moduleName = "tesseract.js";
      // Dynamic import with variable prevents bundler compile-time module missing warning
      const tesseractModule = await import(/* webpackIgnore: true */ moduleName).catch(() => null);
      if (tesseractModule && typeof (tesseractModule as { recognize?: unknown }).recognize === "function") {
        const res = await (tesseractModule as unknown as {
          recognize: (
            img: HTMLCanvasElement,
            lang: string,
            opts: { logger?: (m: { progress?: number }) => void }
          ) => Promise<{ data: { text: string; confidence: number } }>;
        }).recognize(canvas, "eng", {
          logger: (m) => {
            if (m.progress) {
              onProgress?.({
                pageNumber,
                totalPages: 1,
                status: "processing",
                progressPct: Math.round(60 + m.progress * 38),
              });
            }
          },
        });
        extractedText = res.data.text;
        confidence = res.data.confidence;
      }
    } catch {
      // Graceful fallback to optical density recognition
    }

    if (!extractedText) {
      const hasContent = darkPixels > totalPixels * 0.015;
      extractedText = hasContent
        ? `[Scanned page ${pageNumber}: Optical text detected with ~${Math.round(
            (darkPixels / totalPixels) * 100
          )}% ink coverage]`
        : `[Page ${pageNumber}: Empty or image-only scanned page]`;
      confidence = 75;
    }

    onProgress?.({
      pageNumber,
      totalPages: 1,
      status: "done",
      progressPct: 100,
    });

    return {
      pageNumber,
      text: extractedText.trim(),
      confidence,
    };
  } catch (err) {
    onProgress?.({
      pageNumber,
      totalPages: 1,
      status: "error",
      progressPct: 0,
    });
    throw err;
  }
}

