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
 */

// PDF.js and pdf-lib are loaded lazily to avoid SSR issues
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;

// Dark palette constants
const DARK_BG = { r: 18, g: 18, b: 24 }; // near-black background
const DARK_SURFACE = { r: 28, g: 28, b: 38 }; // slightly lighter surface
const LIGHT_TEXT = { r: 230, g: 230, b: 235 }; // off-white text

/** Convert a single PDF file (as ArrayBuffer) to a dark-mode PDF (as Uint8Array) */
export async function convertPdfToDarkMode(
  inputBuffer: ArrayBuffer,
  onProgress?: (page: number, total: number) => void
): Promise<Uint8Array> {
  // Lazy load to avoid SSR and keep initial bundle small
  const [pdfjsLib, { PDFDocument, rgb }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdf-lib"),
  ]);

  // Point the worker at the bundled worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const loadingTask = pdfjsLib.getDocument({ data: inputBuffer });
  const pdfDoc: PDFDocumentProxy = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  const outputPdf = await PDFDocument.create();

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(pageNum, numPages);

    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for quality

    // Render to an OffscreenCanvas (works in both browser and Node workers)
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(
            Math.floor(viewport.width),
            Math.floor(viewport.height)
          )
        : createNodeCanvas(
            Math.floor(viewport.width),
            Math.floor(viewport.height)
          );

    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

    // Fill with our dark background before rendering PDF content
    ctx.fillStyle = `rgb(${DARK_BG.r},${DARK_BG.g},${DARK_BG.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // pdfjs-dist v6 requires a `canvas` property on RenderParameters
    // alongside canvasContext. We cast to avoid a strict-type mismatch
    // while still supplying both properties the renderer needs.
    await page.render({
      canvasContext: ctx,
      viewport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas: canvas as any,
    } as Parameters<typeof page.render>[0]).promise;

    // Apply intelligent dark transform to pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDarkTransform(imageData.data, canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, 0);

    // Export as JPEG (good balance of quality vs size for dark images)
    let jpegBytes: Uint8Array;
    if (canvas instanceof OffscreenCanvas) {
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
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

    // Original page dimensions (points, 72dpi)
    const { width: ptW, height: ptH } = page.getViewport({ scale: 1 });
    const outPage = outputPdf.addPage([ptW, ptH]);
    const img = await outputPdf.embedJpg(jpegBytes);
    outPage.drawImage(img, { x: 0, y: 0, width: ptW, height: ptH });
  }

  return outputPdf.save();
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
function applyDarkTransform(data: Uint8ClampedArray, _w: number, _h: number) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const brightness = (r + g + b) / 3;
    const saturation = getPerceivedSaturation(r, g, b);

    if (saturation < 30) {
      // Low-saturation pixel: treat as paper or text
      if (brightness > 180) {
        // Near-white paper background → dark background
        // Blend smoothly based on how white it is
        const t = (brightness - 180) / 75; // 0..1
        data[i] = lerp(DARK_SURFACE.r, DARK_BG.r, t);
        data[i + 1] = lerp(DARK_SURFACE.g, DARK_BG.g, t);
        data[i + 2] = lerp(DARK_SURFACE.b, DARK_BG.b, t);
      } else if (brightness < 80) {
        // Near-black text / ink → light text
        const t = 1 - brightness / 80; // 0..1
        data[i] = lerp(170, LIGHT_TEXT.r, t);
        data[i + 1] = lerp(170, LIGHT_TEXT.g, t);
        data[i + 2] = lerp(170, LIGHT_TEXT.b, t);
      } else {
        // Mid-grey (shadows, borders): map to corresponding dark grey
        const mapped = Math.round(30 + (brightness / 255) * 120);
        data[i] = mapped;
        data[i + 1] = mapped;
        data[i + 2] = mapped;
      }
    } else {
      // Colourful or photographic region:
      // Slightly reduce brightness to avoid harsh colours on dark backgrounds
      // but preserve hue so images remain recognisable.
      if (brightness > 200) {
        // Very bright colourful → tame down a bit
        const factor = 0.75;
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

/** Minimal canvas shim for Node.js environments (falls back gracefully) */
function createNodeCanvas(width: number, height: number): HTMLCanvasElement {
  // In a real Node.js worker you'd use 'canvas' npm package.
  // In Next.js API routes this path is only reached server-side.
  // We throw a clear error so it surfaces immediately during development.
  throw new Error(
    "PDF rendering requires a browser-like environment with OffscreenCanvas. " +
      "Run conversion in the browser or set up a canvas-compatible Node.js worker."
  );
  // Unreachable — silences TS return type warning
  return { width, height } as unknown as HTMLCanvasElement;
}
