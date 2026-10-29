/**
 * Noctra PDF Dark-Mode Conversion Engine
 *
 * Strategy:
 *  1. Use PDF.js to render each page to a canvas at high resolution.
 *  2. For each page, run our intelligent pixel-level transform:
 *     - Detect whether a pixel is part of the "paper" background (near-white)
 *       or near-black text, and remap it to our dark palette.
 *     - Leave photographic / colourful regions largely untouched
 *       (just slightly darken them for visual comfort).
 *  3. Re-encode the processed canvases as JPEG data URLs.
 *  4. Compose them into a new PDF using pdf-lib.
 *
 * This approach preserves images, diagrams and screenshots visually while
 * making text/background comfortable for dark environments.
 * It necessarily rasterises the output — a fully vector approach requires
 * parsing PDF internals which is significantly more complex and fragile.
 * This trade-off is documented in the README.
 *
 * To give back what rasterisation removes, each output page also carries an
 * invisible text layer (rendering mode 3) and re-created link annotations —
 * see `pdf-text-layer.ts`.
 */

import {
  buildTextLayer,
  composeOutputMatrix,
  copyLinkAnnotations,
  drawInvisibleTextLayer,
} from "./pdf-text-layer.ts";
import {
  getConversionProfile,
  type ConversionProfile,
  type ConversionProfileId,
} from "./conversion-profiles.ts";
import type { PagePreview } from "./dark-sweep.ts";

// PDF.js and pdf-lib are loaded lazily to avoid SSR issues
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;

/**
 * Reject with an AbortError as soon as `signal` fires, without waiting on
 * `promise`. Used for pdf.js awaits that a cancellation must not be stuck
 * behind (a wedged worker would otherwise keep the conversion alive after
 * the orchestrator has already settled it).
 *
 * The underlying promise's eventual settlement is ignored; listeners are
 * always removed so repeated conversions do not accumulate them.
 */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException("Conversion cancelled.", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new DOMException("Conversion cancelled.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

const abortError = () => new DOMException("Conversion cancelled.", "AbortError");

/**
 * Finalisation labels reported between the last page tick and a valid
 * output, so the UI can show that export work is still happening.
 */
export type FinalizingReporter = (label: string) => void;

/**
 * Pixel-classification counters gathered while the dark transform runs.
 * Every number is measured from the actual rendered pixels — the quality
 * report never estimates.
 */
export interface PdfPixelStats {
  /** Total pixels examined across all pages. */
  total: number;
  /** Low-saturation near-white pixels remapped to the dark background. */
  paper: number;
  /** Low-saturation near-black pixels remapped to the light text colour. */
  ink: number;
  /** Neutral mid-tones eased toward the dark surface. */
  midtone: number;
  /** Saturated/photo pixels preserved (dimmed only when very bright). */
  colourful: number;
}

export interface PdfConversionResult {
  bytes: Uint8Array;
  pages: number;
  profileId: ConversionProfileId;
  stats: PdfPixelStats;
}

/**
 * Receives real thumbnails of a page captured around the dark transform —
 * `before` fires once the page has rendered (still light), `after` once the
 * transform has been applied. Purely observational: previews are capped for
 * very large documents, every capture step is best-effort, and a preview
 * failure never fails or delays a conversion beyond its own tiny encode.
 */
export type PagePreviewReporter = (
  page: number,
  total: number,
  preview: PagePreview
) => void;

/** Longest edge of a Dark Sweep thumbnail, in device pixels. */
const PREVIEW_THUMB_WIDTH = 160;
/** Pages beyond this cap skip capture so huge documents stay memory-bounded. */
const PREVIEW_PAGE_CAP = 250;

/** Convert a single PDF file (as ArrayBuffer) to a dark-mode PDF */
export async function convertPdfToDarkMode(
  inputBuffer: ArrayBuffer,
  onProgress?: (page: number, total: number) => void,
  profileId?: ConversionProfileId,
  signal?: AbortSignal,
  onFinalizing?: FinalizingReporter,
  onPagePreview?: PagePreviewReporter
): Promise<PdfConversionResult> {
  const profile = getConversionProfile(profileId);
  // Lazy load to avoid SSR and keep initial bundle small
  const [pdfjsLib, { PDFDocument, StandardFonts }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdf-lib"),
  ]);
  if (signal?.aborted) throw abortError();

  // In the browser, point the worker at the locally bundled pdf.js worker
  // file — no third-party CDN request is made during conversion (privacy +
  // offline support). `new URL(..., import.meta.url)` lets the bundler
  // (Turbopack/webpack) emit the worker as a self-hosted static asset.
  // In Node (SSR/tests) the default worker resolution already points at the
  // package's own worker file, so it must be left untouched.
  if (typeof window !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }

  const loadingTask = pdfjsLib.getDocument({ data: inputBuffer });
  try {
    return await renderDarkPdf({
      loadingTask,
      profile,
      onProgress,
      signal,
      onFinalizing,
      onPagePreview,
      PDFDocument,
      StandardFonts,
    });
  } finally {
    // Always terminate the pdf.js worker and release the source document —
    // on success, failure, cancellation and stall alike. pdf.js tolerates
    // repeated destroy() calls; a teardown error must not mask the result.
    try {
      await Promise.resolve(loadingTask.destroy());
    } catch {
      /* worker already gone */
    }
  }
}

interface RenderDarkPdfArgs {
  /** The pdf.js loading task: source of the document and its worker. */
  loadingTask: {
    promise: Promise<PDFDocumentProxy>;
    destroy(): Promise<void> | void;
  };
  profile: ConversionProfile;
  onProgress?: (page: number, total: number) => void;
  signal?: AbortSignal;
  onFinalizing?: FinalizingReporter;
  onPagePreview?: PagePreviewReporter;
  PDFDocument: typeof import("pdf-lib").PDFDocument;
  StandardFonts: typeof import("pdf-lib").StandardFonts;
}

async function renderDarkPdf({
  loadingTask,
  profile,
  onProgress,
  signal,
  onFinalizing,
  onPagePreview,
  PDFDocument,
  StandardFonts,
}: RenderDarkPdfArgs): Promise<PdfConversionResult> {
  const pdfDoc: PDFDocumentProxy = await raceAbort(loadingTask.promise, signal);
  const numPages = pdfDoc.numPages;

  // Measured across every page: feeds the OLED quality report.
  const stats: PdfPixelStats = {
    total: 0,
    paper: 0,
    ink: 0,
    midtone: 0,
    colourful: 0,
  };

  const outputPdf = await PDFDocument.create();
  // Helvetica for the invisible text layer (WinAnsi; see pdf-text-layer.ts)
  const layerFont = await outputPdf.embedFont(StandardFonts.Helvetica);
  // Maps input page ref number -> { output ref, output-space matrix },
  // so internal destination links can be re-pointed at the right page
  // with correctly remapped /XYZ coordinates.
  const outputPagesByRefNum = new Map<
    number,
    { ref: import("pdf-lib").PDFRef; matrix: ReturnType<typeof composeOutputMatrix> }
  >();
  type PendingLinkPage = {
    outPage: import("pdf-lib").PDFPage;
    annotations: Awaited<ReturnType<import("pdfjs-dist").PDFPageProxy["getAnnotations"]>>;
    viewport: ReturnType<import("pdfjs-dist").PDFPageProxy["getViewport"]>;
  };
  const pendingLinkPages: PendingLinkPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (signal?.aborted) throw abortError();
    onProgress?.(pageNum, numPages);

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for quality

    // Render to an OffscreenCanvas (works in both browser and Node workers)
    const canvas = createCanvas(
      Math.floor(viewport.width),
      Math.floor(viewport.height)
    );

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    // Fill with our dark background before rendering PDF content
    ctx.fillStyle = `rgb(${profile.background.r},${profile.background.g},${profile.background.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // pdfjs-dist v6 requires a `canvas` property on RenderParameters
    // alongside canvasContext. We cast to avoid a strict-type mismatch
    // while still supplying both properties the renderer needs.
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas: canvas as any,
    } as Parameters<typeof page.render>[0]);
    const abortRender = () => renderTask.cancel?.();
    signal?.addEventListener("abort", abortRender, { once: true });
    try {
      await renderTask.promise;
    } finally {
      signal?.removeEventListener("abort", abortRender);
    }
    if (signal?.aborted) throw new DOMException("Conversion cancelled.", "AbortError");

    // Dark Sweep: capture the real *light* page while the tile that shows it
    // is mid-sweep. Best-effort by design — a preview problem warns and the
    // conversion continues untouched.
    if (onPagePreview && pageNum <= PREVIEW_PAGE_CAP) {
      try {
        const beforeThumb = scalePreviewThumb(canvas);
        if (beforeThumb) {
          const before = await encodePreviewDataUrl(beforeThumb);
          if (before && !signal?.aborted) onPagePreview(pageNum, numPages, { before });
        }
      } catch (err) {
        console.warn("Noctra: light-page preview skipped", err);
      }
    }

    // Apply intelligent dark transform to pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDarkTransform(imageData.data, profile, stats);
    ctx.putImageData(imageData, 0, 0);

    // Export as JPEG (good balance of quality vs size for dark images)
    let jpegBytes: Uint8Array;
    if (
      typeof OffscreenCanvas !== "undefined" &&
      canvas instanceof OffscreenCanvas
    ) {
      const blob = await raceAbort(
        canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 }),
        signal
      );
      jpegBytes = new Uint8Array(await blob.arrayBuffer());
    } else if (
      typeof HTMLCanvasElement !== "undefined" &&
      canvas instanceof HTMLCanvasElement
    ) {
      const blob = await raceAbort(canvasToBlob(canvas), signal);
      jpegBytes = new Uint8Array(await blob.arrayBuffer());
    } else {
      // Node.js path via sharp
      const rawData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const sharp = (await import("sharp")).default;
      jpegBytes = await sharp(Buffer.from(rawData), {
        raw: { width: canvas.width, height: canvas.height, channels: 4 },
      })
        .jpeg({ quality: 92 })
        .toBuffer()
        .then((b) => new Uint8Array(b));
    }
    // Encoding is the longest single-page step — check again before the
    // embed/text-layer work so cancellation stays responsive.
    if (signal?.aborted) throw abortError();

    // Dark Sweep: the transform has landed on this page — capture the real
    // *dark* result as proof the page was swept. Same best-effort rules.
    if (onPagePreview && pageNum <= PREVIEW_PAGE_CAP) {
      try {
        const afterThumb = scalePreviewThumb(canvas);
        if (afterThumb) {
          const after = await encodePreviewDataUrl(afterThumb);
          if (after && !signal?.aborted) onPagePreview(pageNum, numPages, { after });
        }
      } catch (err) {
        console.warn("Noctra: dark-page preview skipped", err);
      }
    }

    // Original page dimensions (points, 72dpi)
    const scaleOneViewport = page.getViewport({ scale: 1 });
    const { width: ptW, height: ptH } = scaleOneViewport;
    const outPage = outputPdf.addPage([ptW, ptH]);
    const img = await outputPdf.embedJpg(jpegBytes);
    outPage.drawImage(img, { x: 0, y: 0, width: ptW, height: ptH });

    // Preserve the input page ref + its output-space matrix so internal
    // links can be re-pointed (with correctly remapped /XYZ coords).
    if (page.ref) {
      outputPagesByRefNum.set(page.ref.num, {
        ref: outPage.ref,
        matrix: composeOutputMatrix(scaleOneViewport),
      });
    }

    // Restore selectable/searchable text as an invisible layer (Tr 3)
    // positioned exactly over the rasterised glyphs. Best-effort: a failure
    // here must never lose the converted PDF.
    try {
      const textContent = await raceAbort(page.getTextContent(), signal);
      const runs = buildTextLayer(textContent.items, scaleOneViewport);
      drawInvisibleTextLayer(outPage, layerFont, runs);
    } catch (err) {
      if (signal?.aborted) throw abortError();
      console.warn(`Noctra: text layer skipped on page ${pageNum}`, err);
    }

    // Collect link annotations to re-create once every output page exists
    // (internal destinations may target later pages).
    try {
      const annotations = await raceAbort(
        page.getAnnotations({ intent: "display" }),
        signal
      );
      if (annotations.some((a) => a.subtype === "Link")) {
        pendingLinkPages.push({ outPage, annotations, viewport: scaleOneViewport });
      }
    } catch (err) {
      if (signal?.aborted) throw abortError();
      console.warn(`Noctra: annotations skipped on page ${pageNum}`, err);
    }
  }

  if (signal?.aborted) throw abortError();

  // Second pass: re-create link annotations now that every output page ref
  // is known. Internal destinations resolve through the input->output map.
  if (pendingLinkPages.length > 0) {
    onFinalizing?.("Restoring links…");
    for (const { outPage, annotations, viewport } of pendingLinkPages) {
      copyLinkAnnotations(outputPdf, outPage, annotations, viewport, (ref) => {
        return outputPagesByRefNum.get(ref.num as number) ?? null;
      });
    }
  }

  // Serialization is single-threaded and can take a while on large documents
  // — announce it so the UI shows export work instead of a frozen percentage.
  onFinalizing?.("Serializing the dark PDF…");
  if (signal?.aborted) throw abortError();
  const bytes = await outputPdf.save();
  return { bytes, pages: numPages, profileId: profile.id, stats };
}

/**
 * Intelligent per-pixel dark transform.
 *
 * Three regions:
 *  - "Paper" (near-white, low saturation): remap to dark background
 *  - "Text/ink" (near-black, low saturation): remap to light text colour
 *  - "Colourful / photographic": desaturate slightly + blend toward dark surface
 *    but leave mostly intact so diagrams / photos stay recognisable
 */
export function applyDarkTransform(
  data: Uint8ClampedArray,
  profile: ConversionProfile = getConversionProfile(undefined),
  stats?: PdfPixelStats
): void {
  if (stats) stats.total += data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const brightness = (r + g + b) / 3;
    const saturation = getPerceivedSaturation(r, g, b);

    if (saturation < 30) {
      // Low-saturation pixel: treat as paper or text. The three ranges are
      // deliberately continuous at 70 and 180. The old hard branches mapped
      // 79 → light text but 80 → dark grey, and 179 → mid-grey but 180 → paper;
      // anti-aliased glyph edges could therefore become dotted/noisy.
      if (brightness >= 180) {
        if (stats) stats.paper++;
        // Near-white paper background → dark background
        // Blend smoothly based on how white it is
        const t = (brightness - 180) / 75; // 0..1
        data[i] = lerp(profile.surface.r, profile.background.r, t);
        data[i + 1] = lerp(profile.surface.g, profile.background.g, t);
        data[i + 2] = lerp(profile.surface.b, profile.background.b, t);
      } else if (brightness <= 70) {
        if (stats) stats.ink++;
        // Near-black text / ink → light text
        const t = brightness / 70;
        data[i] = lerp(profile.text.r, 150, t);
        data[i + 1] = lerp(profile.text.g, 150, t);
        data[i + 2] = lerp(profile.text.b, 150, t);
      } else {
        if (stats) stats.midtone++;
        // Anti-aliased text and neutral mid-tones: ease into the dark surface
        // instead of crushing a narrow band into an unreadable grey.
        const t = (brightness - 70) / 110;
        data[i] = lerp(150, profile.surface.r, t);
        data[i + 1] = lerp(150, profile.surface.g, t);
        data[i + 2] = lerp(150, profile.surface.b, t);
      }
    } else {
      if (stats) stats.colourful++;
      // Colourful or photographic region:
      // Slightly reduce brightness to avoid harsh colours on dark backgrounds
      // but preserve hue so images remain recognisable.
      if (brightness > 200) {
        // Very bright colourful → tame down a bit
        const factor = profile.id === "low-contrast-night" ? 0.62 : 0.75;
        data[i] = Math.round(r * factor);
        data[i + 1] = Math.round(g * factor);
        data[i + 2] = Math.round(b * factor);
      }
      // else: leave as-is (mid-tone and dark colourful pixels look fine as-is)
    }
    // Alpha channel unchanged
  }
}

/** Perceived saturation 0..100 */
function getPerceivedSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return ((max - min) / max) * 100;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

/** Prefer OffscreenCanvas, with an HTML canvas fallback for Safari and older browsers. */
function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  // In a real Node.js worker you would use a canvas-compatible package. The
  // browser is the supported conversion runtime, so fail with an actionable
  // message rather than producing a corrupt PDF.
  throw new Error(
    "PDF rendering requires a browser-like environment with OffscreenCanvas. " +
      "Run conversion in the browser or set up a canvas-compatible Node.js worker."
  );
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode the converted PDF page."));
      },
      "image/jpeg",
      0.92
    );
  });
}

/* ── Dark Sweep thumbnails ────────────────────────────────────────────── */

/**
 * Downscale a canvas copy to preview size. Synchronous and defensive: any
 * failure returns null so the caller simply captures no thumbnail.
 */
function scalePreviewThumb(
  canvas: OffscreenCanvas | HTMLCanvasElement
): OffscreenCanvas | HTMLCanvasElement | null {
  try {
    const { width, height } = canvas;
    if (!width || !height) return null;
    const tw = Math.min(PREVIEW_THUMB_WIDTH, width);
    const th = Math.max(1, Math.round((height * tw) / width));
    const thumb = createCanvas(tw, th);
    const tctx = thumb.getContext("2d") as CanvasRenderingContext2D | null;
    if (!tctx) return null;
    tctx.drawImage(canvas, 0, 0, tw, th);
    return thumb;
  } catch {
    return null;
  }
}

/** Base64-encode a small JPEG blob as a data URL (chunk-free: thumbs are tiny). */
async function previewBlobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Encode a thumbnail to a JPEG data URL. Browser canvas paths only — in
 * runtimes without a blob-encoding canvas this returns null and the
 * conversion proceeds without previews (skeleton tiles in the strip).
 */
async function encodePreviewDataUrl(
  thumb: OffscreenCanvas | HTMLCanvasElement
): Promise<string | null> {
  if (typeof OffscreenCanvas !== "undefined" && thumb instanceof OffscreenCanvas) {
    const blob = await thumb.convertToBlob({ type: "image/jpeg", quality: 0.72 });
    return previewBlobToDataUrl(blob);
  }
  if (typeof HTMLCanvasElement !== "undefined" && thumb instanceof HTMLCanvasElement) {
    return previewBlobToDataUrl(await canvasToBlob(thumb));
  }
  return null;
}
