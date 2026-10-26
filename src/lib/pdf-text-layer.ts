/**
 * Noctra PDF invisible text layer + link preservation
 *
 * The dark-mode converter rasterises every page (see `pdf-converter.ts`),
 * which historically destroyed selectable/searchable text and hyperlinks.
 * This module adds back, on top of the raster image:
 *
 *  1. An *invisible* text layer (text rendering mode 3, `3 Tr`) positioned
 *     with the exact text matrices reported by PDF.js, so search, selection,
 *     copy/paste and screen readers work again without changing a single
 *     visible pixel of the output.
 *  2. Link annotations (URI links and internal page-destination links),
 *     re-created on the output pages with borderless appearance.
 *
 * The module is deliberately split into pure functions (matrix math,
 * text sanitisation, run building, rect mapping) that need no PDF
 * runtime, plus thin drawing helpers that take pdf-lib objects. That
 * makes every positioning decision unit-testable with synthetic PDFs.
 *
 * Known limitations (documented in the README):
 *  - Only WinAnsi-encodable glyphs (Latin + Western European + a few
 *    typographic symbols) survive; CJK/emoji runs are dropped rather
 *    than garbled. Substituting a full Unicode font would require
 *    shipping/embedding one.
 *  - Helvetica metrics approximate the original font's advance widths
 *    (we scale runs horizontally to match the measured width), so
 *    selection highlights are close but not pixel-perfect.
 *  - Only Link annotations are copied; comments/highlights/form fields
 *    are not (their appearance streams cannot be reproduced faithfully
 *    from the raster pipeline).
 */

import {
  PDFHexString,
  TextRenderingMode,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  type PDFDict,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";

/** 6-element PDF matrix `[a, b, c, d, e, f]` (PDF 8.3.3 convention). */
export type Matrix6 = [number, number, number, number, number, number];

/** Minimal structural view of a PDF.js text content item. */
export interface TextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  dir?: string;
}

/** Minimal structural view of a PDF.js viewport (`page.getViewport`). */
export interface ViewportLike {
  width: number;
  height: number;
  transform: number[];
}

/** Minimal structural view of a PDF.js link annotation. */
export interface LinkAnnotationLike {
  subtype?: string;
  url?: string;
  unsafeUrl?: string;
  dest?: unknown;
  rect?: number[];
}

/** A text run positioned in *output page space* (points, y-up, origin bottom-left). */
export interface PositionedTextRun {
  text: string;
  matrix: Matrix6;
  /** Original advance width in output-space points (used for horizontal scaling). */
  width: number;
}

/** Compose two PDF matrices: result applies `m2` first, then `m1`. */
export function multiplyMatrices(m1: Matrix6, m2: Matrix6): Matrix6 {
  // PDF 8.3.3: x' = a·x + c·y + e, y' = b·x + d·y + f.
  // R = m1 ∘ m2:
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Map a point through a PDF matrix. */
export function transformPoint(
  m: Matrix6,
  x: number,
  y: number
): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * The y-flip that turns PDF.js *device space* (y-down, origin top-left,
 * already including page rotation) into PDF page space (y-up, origin
 * bottom-left) for a page `height` points tall.
 */
export function flipYMatrix(height: number): Matrix6 {
  return [1, 0, 0, -1, 0, height];
}

/**
 * Full transform from the PDF.js text-item space (unrotated user space,
 * y-up) to output page space: apply the viewport (rotation + scale-1
 * device mapping), then flip y back.
 */
export function composeOutputMatrix(
  viewport: ViewportLike
): Matrix6 {
  return multiplyMatrices(flipYMatrix(viewport.height), [
    viewport.transform[0],
    viewport.transform[1],
    viewport.transform[2],
    viewport.transform[3],
    viewport.transform[4],
    viewport.transform[5],
  ]);
}

/**
 * Code point ranges encodable by pdf-lib's WinAnsi (CP1252) standard-font
 * encoding. Verified exhaustively against `PDFFont.encodeText` for
 * Helvetica; the property test in `tests/pdf-text-layer.test.ts` re-checks
 * this agreement over the whole BMP.
 */
const WINANSI_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e],
  [0xa0, 0xff],
  [0x152, 0x153],
  [0x160, 0x161],
  [0x178, 0x178],
  [0x17d, 0x17e],
  [0x192, 0x192],
  [0x2c6, 0x2c6],
  [0x2dc, 0x2dc],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2022],
  [0x2026, 0x2026],
  [0x2030, 0x2030],
  [0x2039, 0x203a],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
];

/** Whether a code point can be encoded with pdf-lib's WinAnsi fonts. */
export function isWinAnsiEncodable(codePoint: number): boolean {
  for (const [lo, hi] of WINANSI_RANGES) {
    if (codePoint >= lo && codePoint <= hi) return true;
  }
  return false;
}

/**
 * Drop characters that the invisible layer's font cannot encode
 * (control characters, CJK, emoji, …). Runs that become empty are
 * skipped by `buildTextLayer` instead of producing garbled text.
 */
export function sanitizeForWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    if (isWinAnsiEncodable(ch.codePointAt(0) ?? -1)) out += ch;
  }
  return out;
}

/**
 * Turn PDF.js text items into output-space text runs:
 *  - compose each item's text matrix through the page viewport so the run
 *    lands exactly where the rasterised glyphs are (handles page rotation),
 *  - strip characters the layer font cannot encode,
 *  - skip empty and whitespace-only runs (they carry no selectable text).
 *
 * Items without a `str` (marked-content markers) are ignored.
 */
export function buildTextLayer(
  items: readonly unknown[],
  viewport: ViewportLike
): PositionedTextRun[] {
  const outputMatrix = composeOutputMatrix(viewport);
  const runs: PositionedTextRun[] = [];

  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as TextItemLike;
    if (typeof item.str !== "string" || item.str.length === 0) continue;
    const t = item.transform;
    if (!Array.isArray(t) || t.length !== 6 || t.some((n) => !Number.isFinite(n))) {
      continue;
    }

    const text = sanitizeForWinAnsi(item.str);
    if (text.trim().length === 0) continue;

    const matrix = multiplyMatrices(outputMatrix, [
      t[0],
      t[1],
      t[2],
      t[3],
      t[4],
      t[5],
    ]);
    // Guard against degenerate matrices (zero/negative scale) that would
    // produce invisible or mirrored garbage in the layer.
    const size = Math.hypot(matrix[0], matrix[1]);
    if (!Number.isFinite(size) || size <= 0) continue;

    const width = Number.isFinite(item.width) ? (item.width as number) : 0;
    runs.push({ text, matrix, width });
  }

  return runs;
}

/** Schemes we are willing to re-create as clickable links on the output. */
const SAFE_URL_SCHEMES = /^(https?|mailto):/i;

function extractLinkUrl(annotation: LinkAnnotationLike): string | null {
  // pdf.js sets `url` for URLs it considers safe; `unsafeUrl` holds the
  // raw value. Only re-create well-known schemes to avoid resurrecting
  // javascript:/data: links.
  const candidate = annotation.url ?? annotation.unsafeUrl;
  if (typeof candidate !== "string" || candidate.length === 0) return null;
  if (!SAFE_URL_SCHEMES.test(candidate)) return null;
  return candidate;
}

/** Map a user-space annotation rect into output page space, normalised. */
export function mapRectToOutputSpace(
  rect: readonly number[],
  viewport: ViewportLike
): [number, number, number, number] {
  const m = composeOutputMatrix(viewport);
  const [x1, y1] = transformPoint(m, rect[0], rect[1]);
  const [x2, y2] = transformPoint(m, rect[2], rect[3]);
  return [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.max(x1, x2),
    Math.max(y1, y2),
  ];
}

/** Filter PDF.js annotations down to the links we know how to preserve. */
export function selectPreservableLinks(
  annotations: readonly (LinkAnnotationLike | undefined)[],
  viewport: ViewportLike
): Array<{ rect: [number, number, number, number]; url?: string; dest?: unknown }> {
  const links: Array<{
    rect: [number, number, number, number];
    url?: string;
    dest?: unknown;
  }> = [];
  for (const annotation of annotations) {
    if (!annotation || annotation.subtype !== "Link") continue;
    if (!Array.isArray(annotation.rect) || annotation.rect.length !== 4) continue;
    const rect = mapRectToOutputSpace(annotation.rect, viewport);
    const url = extractLinkUrl(annotation);
    if (url) {
      links.push({ rect, url });
    } else if (annotation.dest !== undefined && annotation.dest !== null) {
      links.push({ rect, dest: annotation.dest });
    }
  }
  return links;
}

function utf8ToHex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0").toUpperCase();
  }
  return hex;
}

/**
 * Draw the invisible text layer for one page. Every run is emitted with
 * text rendering mode 3 (`3 Tr` = invisible) inside an explicit `q`/`Q`
 * so the mode cannot leak into any other content. The font size is baked
 * into the text matrix (PDF.js reports it that way), so `Tf` is 1.
 *
 * Runs are horizontally scaled to match the advance width measured by
 * PDF.js in the original document, which keeps selection highlights
 * aligned with the visible rasterised glyphs despite the font substitute.
 */
export function drawInvisibleTextLayer(
  page: PDFPage,
  font: PDFFont,
  runs: readonly PositionedTextRun[]
): void {
  if (runs.length === 0) return;
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  const operators = [pushGraphicsState()];
  for (const run of runs) {
    let encoded: ReturnType<PDFFont["encodeText"]>;
    try {
      encoded = font.encodeText(run.text);
    } catch {
      // Should not happen after sanitisation; skip rather than corrupt.
      continue;
    }

    const [a, b, c, d, e, f] = run.matrix;
    const size = Math.hypot(a, b);
    let scaleX = 1;
    if (run.width > 0 && size > 0) {
      try {
        const natural = font.widthOfTextAtSize(run.text, size);
        if (natural > 0) {
          // Clamp so a pathological original font cannot explode glyphs.
          scaleX = Math.min(5, Math.max(0.2, run.width / natural));
        }
      } catch {
        scaleX = 1;
      }
    }

    operators.push(
      beginText(),
      setFontAndSize(fontKey, 1),
      setTextRenderingMode(TextRenderingMode.Invisible),
      // Scale the x-basis (a, b) to match the original advance width.
      setTextMatrix(a * scaleX, b * scaleX, c, d, e, f),
      showText(encoded),
      endText()
    );
  }
  operators.push(popGraphicsState());
  page.pushOperators(...operators);
}

function destModeName(dest: unknown[]): string | null {
  const mode = dest[1];
  if (typeof mode === "string") return mode;
  if (mode && typeof mode === "object" && "name" in mode) {
    const name = (mode as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

interface DestRefLike {
  num?: unknown;
  gen?: unknown;
}

function isPageRef(value: unknown): value is DestRefLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DestRefLike).num === "number"
  );
}

export interface TargetPage {
  ref: PDFRef;
  /** Composition matrix for the target page (used to remap XYZ coords). */
  matrix: Matrix6;
}

/**
 * Re-create the preservable links of one page on the output page:
 *  - URI links (http/https/mailto) become borderless clickable link
 *    annotations with the exact same rectangle,
 *  - internal destination links are re-pointed at the corresponding
 *    output page (page order is preserved 1:1 by the converter), keeping
 *    /XYZ coordinates when the destination resolves.
 *
 * `resolveTargetPage` maps an input-document page ref to the output
 * page it became; return `null` to drop the link instead of pointing it
 * at the wrong page.
 *
 * Returns the number of annotations added.
 */
export function copyLinkAnnotations(
  doc: PDFDocument,
  page: PDFPage,
  annotations: readonly (LinkAnnotationLike | undefined)[],
  viewport: ViewportLike,
  resolveTargetPage: (ref: DestRefLike) => TargetPage | null
): number {
  const links = selectPreservableLinks(annotations, viewport);
  let added = 0;

  for (const link of links) {
    let annot: PDFDict | null = null;

    if (link.url !== undefined) {
      annot = doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [...link.rect],
        Border: [0, 0, 0],
        A: {
          Type: "Action",
          S: "URI",
          URI: PDFHexString.of(utf8ToHex(link.url)),
        },
      });
    } else if (Array.isArray(link.dest) && isPageRef(link.dest[0])) {
      const target = resolveTargetPage(link.dest[0]);
      if (target) {
        const mode = destModeName(link.dest) ?? "Fit";
        let dest: [PDFRef, string, number | null, number | null, number | null] | [PDFRef, string];
        if (mode === "XYZ") {
          const rawX = link.dest[2];
          const rawY = link.dest[3];
          const rawZoom = link.dest[4];
          let x: number | null = null;
          let y: number | null = null;
          if (typeof rawX === "number" && typeof rawY === "number") {
            [x, y] = transformPoint(target.matrix, rawX, rawY);
          }
          const zoom = typeof rawZoom === "number" ? rawZoom : null;
          dest = [target.ref, "XYZ", x, y, zoom];
        } else {
          // Fit/FitH/FitV/… : jump to the top of the target page.
          dest = [target.ref, "Fit"];
        }
        annot = doc.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [...link.rect],
          Border: [0, 0, 0],
          Dest: doc.context.obj(dest),
        });
      }
    }

    if (annot) {
      page.node.addAnnot(doc.context.register(annot));
      added += 1;
    }
  }

  return added;
}
