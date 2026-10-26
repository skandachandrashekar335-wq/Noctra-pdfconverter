import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFHexString, StandardFonts, degrees, rgb, type PDFRef } from "pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";
import {
  buildTextLayer,
  composeOutputMatrix,
  copyLinkAnnotations,
  drawInvisibleTextLayer,
  flipYMatrix,
  isWinAnsiEncodable,
  mapRectToOutputSpace,
  multiplyMatrices,
  sanitizeForWinAnsi,
  selectPreservableLinks,
  transformPoint,
  type Matrix6,
  type ViewportLike,
} from "../src/lib/pdf-text-layer.ts";

// pdf.js is loaded lazily; the legacy build runs in Node.
async function loadPdfjs() {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

async function openDoc(bytes: Uint8Array) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
}

/** Extract per-page strings + transforms from a PDF. */
async function extractText(doc: Awaited<ReturnType<typeof openDoc>>) {
  const pages: Array<
    Array<{ str: string; transform: number[]; width: number }>
  > = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page: PDFPageProxy = await doc.getPage(i);
    const tc = await page.getTextContent();
    const runs: Array<{ str: string; transform: number[]; width: number }> = [];
    for (const raw of tc.items) {
      const it = raw as unknown as {
        str?: string;
        transform?: number[];
        width?: number;
      };
      if (typeof it.str !== "string") continue; // marked-content marker
      runs.push({
        str: it.str,
        transform: it.transform ?? [],
        width: it.width ?? 0,
      });
    }
    pages.push(runs);
  }
  return pages;
}

/** Page dimensions + rotation as seen by pdf.js. */
async function pageGeometry(doc: Awaited<ReturnType<typeof openDoc>>) {
  const out: Array<{ width: number; height: number; rotate: number }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    out.push({ width: vp.width, height: vp.height, rotate: page.rotate });
  }
  return out;
}

/** Decode the (flate-compressed) content stream(s) of a pdf-lib page. */
async function contentStreamOf(bytes: Uint8Array, pageIndex: number) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();
  assert.ok(contents, "page must have a content stream");
  // A page's content may be a single stream or a PDFArray of streams.
  const arr = contents as unknown as { asArray?: () => PDFRef[] };
  const refs: Array<PDFRef | typeof contents> =
    typeof arr.asArray === "function" ? arr.asArray() : [contents];
  let combined = "";
  for (const ref of refs) {
    const stream = doc.context.lookup(ref) as {
      getContents?: () => Uint8Array;
    } | null;
    const data = stream?.getContents?.();
    if (!data) continue;
    try {
      combined += inflateSync(Buffer.from(data)).toString("latin1");
    } catch {
      combined += Buffer.from(data).toString("latin1");
    }
  }
  return combined;
}

/**
 * Every text-showing operator (Tj/TJ/') in the stream must happen while
 * text rendering mode 3 (invisible) is active. Returns the count of
 * invisible text shows. Throws if any visible text would be painted.
 */
function assertAllTextInvisible(content: string) {
  const tokens = content.split(/\s+/).filter(Boolean);
  let mode = 0; // default rendering mode is 0 (fill, visible)
  let invisibleShows = 0;
  let visibleShows = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "Tr" && i > 0) {
      const parsed = Number(tokens[i - 1]);
      if (Number.isFinite(parsed)) mode = parsed;
    } else if (tok === "Tj" || tok === "TJ" || tok === "'") {
      if (mode === 3) invisibleShows++;
      else visibleShows++;
    } else if (tok === "BT") {
      // rendering mode is part of graphics state and survives BT/ET,
      // but pdf-lib emits Tr inside each BT block; no reset here.
    }
  }
  assert.equal(
    visibleShows,
    0,
    `content stream must paint no visible text, found ${visibleShows} visible text ops`
  );
  return invisibleShows;
}

// ---------------------------------------------------------------------------
// Pure function unit tests
// ---------------------------------------------------------------------------

describe("matrix math", () => {
  test("multiplyMatrices composes left-after-right", () => {
    // scale by 2 then translate by (5, 7)
    const scale: Matrix6 = [2, 0, 0, 2, 0, 0];
    const translate: Matrix6 = [1, 0, 0, 1, 5, 7];
    const composed = multiplyMatrices(translate, scale);
    assert.deepEqual(transformPoint(composed, 1, 1), [7, 9]);
  });

  test("flipYMatrix maps device space back to page space", () => {
    const flip = flipYMatrix(200);
    assert.deepEqual(transformPoint(flip, 30, 40), [30, 160]);
  });

  test("composeOutputMatrix is identity for rotation-0 pages", () => {
    const viewport: ViewportLike = {
      width: 300,
      height: 200,
      transform: [1, 0, 0, -1, 0, 200],
    };
    const m = composeOutputMatrix(viewport);
    // A user-space point must land on itself.
    assert.deepEqual(transformPoint(m, 40, 150).map((n) => +n.toFixed(6)), [
      40, 150,
    ]);
  });

  test("composeOutputMatrix handles 90° page rotation", () => {
    // pdf.js viewport for a 300x200 page rotated 90°: 200x300 device space.
    const viewport: ViewportLike = {
      width: 200,
      height: 300,
      transform: [0, 1, 1, 0, 0, 0],
    };
    const m = composeOutputMatrix(viewport);
    // User-space (30, 100) -> device (100, 30) -> page (100, 270).
    assert.deepEqual(transformPoint(m, 30, 100).map((n) => +n.toFixed(6)), [
      100, 270,
    ]);
  });
});

describe("WinAnsi sanitisation", () => {
  test("isWinAnsiEncodable agrees with pdf-lib for the whole BMP", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let cp = 0; cp <= 0xffff; cp++) {
      let encodable: boolean;
      try {
        font.encodeText(String.fromCodePoint(cp));
        encodable = true;
      } catch {
        encodable = false;
      }
      assert.equal(
        isWinAnsiEncodable(cp),
        encodable,
        `code point U+${cp.toString(16)} disagreement`
      );
    }
  });

  test("sanitizeForWinAnsi keeps Latin text and drops CJK/emoji", () => {
    assert.equal(sanitizeForWinAnsi("Café naïve – “ok”"), "Café naïve – “ok”");
    // CJK + emoji code points are removed, surrounding ASCII is kept.
    assert.equal(sanitizeForWinAnsi("Hello, 世界! 😀"), "Hello, ! ");
    assert.equal(sanitizeForWinAnsi("日本語のみ"), "");
  });
});

describe("buildTextLayer (pure)", () => {
  const viewport: ViewportLike = {
    width: 300,
    height: 200,
    transform: [1, 0, 0, -1, 0, 200],
  };

  test("places runs at their user-space position", () => {
    const runs = buildTextLayer(
      [{ str: "Hello", transform: [12, 0, 0, 12, 40, 150], width: 30 }],
      viewport
    );
    assert.equal(runs.length, 1);
    assert.equal(runs[0].text, "Hello");
    assert.deepEqual(runs[0].matrix, [12, 0, 0, 12, 40, 150]);
  });

  test("skips empty, whitespace-only and malformed items", () => {
    const runs = buildTextLayer(
      [
        { str: "", transform: [12, 0, 0, 12, 0, 0] },
        { str: "   ", transform: [12, 0, 0, 12, 0, 0] },
        { str: "x" }, // no transform
        { str: "x", transform: [1, 0, 0, 1] }, // short transform
        { str: "x", transform: [NaN, 0, 0, 1, 0, 0] }, // NaN
        undefined,
        null,
        // marked-content objects have no str
        { type: "beginMarkedContentProps", id: "foo" },
      ],
      viewport
    );
    assert.equal(runs.length, 0);
  });

  test("drops runs whose matrix is degenerate (zero scale)", () => {
    const runs = buildTextLayer(
      [{ str: "ghost", transform: [0, 0, 0, 0, 10, 10] }],
      viewport
    );
    assert.equal(runs.length, 0);
  });

  test("strips characters the layer font cannot encode", () => {
    const runs = buildTextLayer(
      [{ str: "Hi 世界", transform: [12, 0, 0, 12, 10, 10], width: 20 }],
      viewport
    );
    assert.equal(runs.length, 1);
    assert.equal(runs[0].text, "Hi ");
  });

  test("composes rotated-page items into output space", () => {
    const rotated: ViewportLike = {
      width: 200,
      height: 300,
      transform: [0, 1, 1, 0, 0, 0],
    };
    const runs = buildTextLayer(
      [{ str: "Rotated", transform: [10, 0, 0, 10, 30, 100], width: 40 }],
      rotated
    );
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].matrix, [0, -10, 10, 0, 100, 270]);
  });
});

describe("link selection (pure)", () => {
  const viewport: ViewportLike = {
    width: 300,
    height: 200,
    transform: [1, 0, 0, -1, 0, 200],
  };

  test("keeps http/https/mailto links, drops unsafe schemes", () => {
    const links = selectPreservableLinks(
      [
        { subtype: "Link", rect: [0, 0, 10, 10], url: "https://a.example/x" },
        { subtype: "Link", rect: [0, 0, 10, 10], url: "http://b.example/" },
        { subtype: "Link", rect: [0, 0, 10, 10], url: "mailto:c@d.example" },
        { subtype: "Link", rect: [0, 0, 10, 10], url: "javascript:alert(1)" },
        { subtype: "Link", rect: [0, 0, 10, 10], url: "data:text/html,x" },
        { subtype: "Highlight", rect: [0, 0, 10, 10], url: "https://a.example/x" },
        { subtype: "Link", rect: [0, 0, 10, 10] }, // no url/dest
      ],
      viewport
    );
    assert.deepEqual(
      links.map((l) => l.url),
      ["https://a.example/x", "http://b.example/", "mailto:c@d.example"]
    );
  });

  test("falls back to unsafeUrl only for safe schemes", () => {
    const links = selectPreservableLinks(
      [
        { subtype: "Link", rect: [0, 0, 1, 1], unsafeUrl: "https://ok.example/" },
        { subtype: "Link", rect: [0, 0, 1, 1], unsafeUrl: "javascript:bad()" },
      ],
      viewport
    );
    assert.deepEqual(links.map((l) => l.url), ["https://ok.example/"]);
  });

  test("keeps internal dest links", () => {
    const dest = [{ num: 5, gen: 0 }, { name: "XYZ" }, 10, 20, null];
    const links = selectPreservableLinks(
      [{ subtype: "Link", rect: [1, 2, 3, 4], dest }],
      viewport
    );
    assert.equal(links.length, 1);
    assert.equal(links[0].dest, dest);
  });

  test("mapRectToOutputSpace normalises and flips y", () => {
    // For rotation-0 pages the output page space equals user space, so the
    // rect is preserved; y only differs when the page is rotated.
    assert.deepEqual(mapRectToOutputSpace([10, 20, 30, 40], viewport), [
      10, 20, 30, 40,
    ]);
    // reversed corners are normalised
    assert.deepEqual(mapRectToOutputSpace([30, 40, 10, 20], viewport), [
      10, 20, 30, 40,
    ]);
    // rotated page: user (10,20)-(30,40) -> output (20,270)-(40,290)
    const rotated: ViewportLike = {
      width: 200,
      height: 300,
      transform: [0, 1, 1, 0, 0, 0],
    };
    assert.deepEqual(mapRectToOutputSpace([10, 20, 30, 40], rotated), [
      20, 270, 40, 290,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Synthetic-PDF integration tests: pdf-lib input -> pdf.js extraction ->
// invisible layer -> pdf.js re-extraction of the output.
// ---------------------------------------------------------------------------

/**
 * Build the synthetic input used across integration tests:
 *  page 1: two text runs, a URI link (with parens), an internal link to p3
 *  page 2: rotated 90°, one text run
 *  page 3: link target with a mixed-encodable string
 */
async function buildInputPdf() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const times = await doc.embedFont(StandardFonts.TimesRoman);

  const p1 = doc.addPage([300, 200]);
  p1.drawText("Hello Noctra", { x: 40, y: 150, size: 12, font: helv });
  p1.drawText("Big Title", { x: 40, y: 100, size: 24, font: times });

  const p2 = doc.addPage([300, 200]);
  p2.setRotation(degrees(90));
  p2.drawText("Rotated Page Text", { x: 30, y: 100, size: 10, font: helv });

  const p3 = doc.addPage([300, 200]);
  p3.drawText("Page Three Target", { x: 20, y: 160, size: 14, font: helv });
  p3.drawRectangle({ x: 0, y: 0, width: 300, height: 200, color: rgb(1, 1, 1) });

  const uri = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [40, 20, 160, 40],
    Border: [0, 0, 0],
    A: {
      Type: "Action",
      S: "URI",
      URI: PDFHexString.of(
        Buffer.from("https://example.com/paren(x)", "utf8")
          .toString("hex")
          .toUpperCase()
      ),
    },
  });
  p1.node.addAnnot(doc.context.register(uri));

  const p3ref = doc.getPage(2).ref;
  const internal = doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [200, 150, 280, 170],
    Border: [0, 0, 0],
    Dest: [p3ref, "XYZ", null, null, null],
  });
  p1.node.addAnnot(doc.context.register(internal));

  return doc.save();
}

/**
 * Run the converter's non-rasterisation pipeline (the exact functions the
 * converter calls) over an input PDF: page geometry, invisible text layer,
 * link re-creation. Rasterisation itself needs a canvas and is covered by
 * the browser E2E; the page is filled with a plain rectangle instead so
 * "no visible text" remains assertable.
 */
async function runTextLayerPipeline(input: Uint8Array) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(input) }).promise;
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);

  type Pending = {
    outPage: ReturnType<typeof out.addPage>;
    annotations: Awaited<ReturnType<PDFPageProxy["getAnnotations"]>>;
    viewport: ReturnType<PDFPageProxy["getViewport"]>;
  };
  const pending: Pending[] = [];
  const byRefNum = new Map<
    number,
    { ref: ReturnType<typeof out.addPage>["ref"]; matrix: Matrix6 }
  >();

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const outPage = out.addPage([vp1.width, vp1.height]);
    // Stand-in for the raster image.
    outPage.drawRectangle({
      x: 0,
      y: 0,
      width: vp1.width,
      height: vp1.height,
      color: rgb(0.07, 0.07, 0.09),
    });
    if (page.ref) {
      byRefNum.set(page.ref.num, {
        ref: outPage.ref,
        matrix: composeOutputMatrix(vp1),
      });
    }
    const tc = await page.getTextContent();
    drawInvisibleTextLayer(outPage, font, buildTextLayer(tc.items, vp1));
    const annots = await page.getAnnotations({ intent: "display" });
    if (annots.some((a) => a.subtype === "Link")) {
      pending.push({ outPage, annotations: annots, viewport: vp1 });
    }
  }

  for (const { outPage, annotations, viewport } of pending) {
    copyLinkAnnotations(out, outPage, annotations, viewport, (ref) =>
      byRefNum.get(ref.num as number) ?? null
    );
  }

  return out.save();
}

describe("synthetic PDF round-trip: text extraction", () => {
  test("text content, order and page assignment survive conversion", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);

    const inDoc = await openDoc(input);
    const outDoc = await openDoc(output);
    const before = await extractText(inDoc);
    const after = await extractText(outDoc);

    assert.equal(after.length, before.length, "page count preserved");
    for (let p = 0; p < before.length; p++) {
      const beforeStrings = before[p].map((it) => it.str).filter((s) => s.trim());
      const afterStrings = after[p].map((it) => it.str).filter((s) => s.trim());
      assert.deepEqual(
        afterStrings,
        beforeStrings,
        `page ${p + 1} strings preserved in order`
      );
    }
  });

  test("no duplicated text (each string extracted exactly once)", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const after = await extractText(await openDoc(output));
    const all = after.flat().map((it) => it.str).filter((s) => s.trim());
    const counts = new Map<string, number>();
    for (const s of all) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const [s, n] of counts) {
      assert.equal(n, 1, `string ${JSON.stringify(s)} must appear once`);
    }
  });

  test("page dimensions and ordering are preserved (incl. rotated page)", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const before = await pageGeometry(await openDoc(input));
    const after = await pageGeometry(await openDoc(output));
    assert.equal(after.length, before.length);
    for (let i = 0; i < before.length; i++) {
      // The output bakes page rotation into the (possibly swapped)
      // dimensions and drops /Rotate, so the rendered geometry matches.
      assert.equal(after[i].width, before[i].width, `page ${i + 1} width`);
      assert.equal(after[i].height, before[i].height, `page ${i + 1} height`);
      assert.equal(after[i].rotate, 0, `page ${i + 1} carries no /Rotate`);
    }
    // Page order: rotated page is still page 2, with swapped dims baked in.
    assert.equal(after[1].width, 200, "rotated page keeps swapped width");
    assert.equal(after[1].height, 300, "rotated page keeps swapped height");
  });
});

describe("synthetic PDF round-trip: positioning (no misalignment)", () => {
  test("extracted transforms match the composed output matrices", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const doc = await openDoc(output);
    const after = await extractText(doc);

    const expected: Array<Array<{ str: string; matrix: Matrix6 }>> = [
      [
        { str: "Hello Noctra", matrix: [12, 0, 0, 12, 40, 150] },
        { str: "Big Title", matrix: [24, 0, 0, 24, 40, 100] },
      ],
      // rotated page: user (30,100) -> output (100, 270), rotated -90°
      [{ str: "Rotated Page Text", matrix: [0, -10, 10, 0, 100, 270] }],
      [{ str: "Page Three Target", matrix: [14, 0, 0, 14, 20, 160] }],
    ];

    for (let p = 0; p < expected.length; p++) {
      assert.equal(after[p].length, expected[p].length, `page ${p + 1} run count`);
      for (let r = 0; r < expected[p].length; r++) {
        const got = after[p][r];
        const want = expected[p][r];
        assert.equal(got.str, want.str, `page ${p + 1} run ${r} text`);
        for (let k = 0; k < 6; k++) {
          assert.ok(
            Math.abs(got.transform[k] - want.matrix[k]) < 0.5,
            `page ${p + 1} run ${r} matrix[${k}]: got ${got.transform[k]}, want ~${want.matrix[k]}`
          );
        }
      }
    }
  });

  test("advance widths stay close to the original (horizontal scaling)", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const before = await extractText(await openDoc(input));
    const after = await extractText(await openDoc(output));
    for (let p = 0; p < before.length; p++) {
      const b = before[p].filter((it) => it.str.trim());
      const a = after[p].filter((it) => it.str.trim());
      assert.equal(a.length, b.length, `page ${p + 1} comparable run count`);
      for (let r = 0; r < b.length; r++) {
        const w0 = b[r].width;
        const w1 = a[r].width;
        if (w0 < 1) continue;
        assert.ok(
          Math.abs(w1 - w0) / w0 < 0.15,
          `page ${p + 1} run ${r} width ${w1} vs original ${w0}`
        );
      }
    }
  });
});

describe("synthetic PDF round-trip: visual output unchanged", () => {
  test("the layer paints no visible text (all ops use Tr 3)", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    for (let p = 0; p < 3; p++) {
      const content = await contentStreamOf(output, p);
      const invisible = assertAllTextInvisible(content);
      assert.ok(
        invisible > 0,
        `page ${p + 1} should contain invisible text ops`
      );
    }
  });

  test("the raster stand-in (visible content) is still drawn first", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const content = await contentStreamOf(output, 0);
    const tokens = content.split(/\s+/).filter(Boolean);
    const fillIdx = tokens.indexOf("f");
    const firstBT = tokens.indexOf("BT");
    assert.ok(fillIdx >= 0, "rectangle fill present");
    assert.ok(
      fillIdx < firstBT,
      "visible fill is drawn before any text object"
    );
  });
});

describe("synthetic PDF round-trip: link preservation", () => {
  test("URI link keeps its exact URL (incl. parentheses) and rect", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const doc = await openDoc(output);
    const page1 = await doc.getPage(1);
    const annots = await page1.getAnnotations({ intent: "display" });
    const uri = annots.find(
      (a) => a.subtype === "Link" && typeof a.url === "string"
    );
    assert.ok(uri, "URI link preserved");
    assert.equal(uri.url, "https://example.com/paren(x)");
    const rect = uri.rect.map((n: number) => +n.toFixed(2));
    assert.deepEqual(rect, [40, 20, 160, 40]);
  });

  test("internal destination link points at output page 3", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const doc = await openDoc(output);
    const page1 = await doc.getPage(1);
    const annots = await page1.getAnnotations({ intent: "display" });
    const internal = annots.find((a) => a.subtype === "Link" && a.dest);
    assert.ok(internal, "internal link preserved");
    const dest = internal.dest as unknown[];
    const targetRef = dest[0] as { num: number; gen: number };
    const targetIndex = await doc.getPageIndex(targetRef as never);
    assert.equal(targetIndex, 2, "link targets page index 2 (page 3)");
  });

  test("non-link annotations are not resurrected", async () => {
    const input = await buildInputPdf();
    const output = await runTextLayerPipeline(input);
    const doc = await openDoc(output);
    const annots = await (await doc.getPage(1)).getAnnotations({ intent: "display" });
    assert.ok(annots.every((a) => a.subtype === "Link"));
    // exactly two links on page 1 (URI + internal)
    assert.equal(annots.filter((a) => a.subtype === "Link").length, 2);
  });

  test("copyLinkAnnotations returns 0 and adds nothing for no links", async () => {
    const out = await PDFDocument.create();
    const page = out.addPage([100, 100]);
    const added = copyLinkAnnotations(
      out,
      page,
      [{ subtype: "Highlight", rect: [0, 0, 1, 1] }],
      { width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] },
      () => null
    );
    assert.equal(added, 0);
  });
});

describe("robustness against hostile/broken content", () => {
  test("CJK-only page produces an empty layer without throwing", async () => {
    // Simulate the run shape PDF.js would report for a CJK-only page.
    const outDoc = await PDFDocument.create();
    const outFont = await outDoc.embedFont(StandardFonts.Helvetica);
    const outPage = outDoc.addPage([200, 100]);
    const runs = buildTextLayer(
      [
        {
          str: "これは日本語のテキストです",
          transform: [10, 0, 0, 10, 10, 50],
          width: 150,
        },
      ],
      { width: 200, height: 100, transform: [1, 0, 0, -1, 0, 100] }
    );
    assert.equal(runs.length, 0);
    drawInvisibleTextLayer(outPage, outFont, runs); // must not throw
    const bytes = await outDoc.save();
    assert.ok(bytes.length > 0);
  });

  test("unresolvable internal dest is dropped, not mis-pointed", async () => {
    const out = await PDFDocument.create();
    const page = out.addPage([100, 100]);
    // A link pointing at a page ref that does not exist in the output map.
    const added = copyLinkAnnotations(
      out,
      page,
      [
        {
          subtype: "Link",
          rect: [10, 10, 50, 50],
          dest: [{ num: 999, gen: 0 }, { name: "XYZ" }, 5, 5, null],
        },
      ],
      { width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] },
      () => null // resolver cannot find the target
    );
    assert.equal(added, 0, "unresolvable links must be dropped");
    const bytes = await out.save();
    const doc = await openDoc(bytes);
    const annots = await (await doc.getPage(1)).getAnnotations({ intent: "display" });
    assert.equal(annots.filter((a) => a.subtype === "Link").length, 0);
  });

  test("unsafe link schemes are never re-created", () => {
    const links = selectPreservableLinks(
      [
        { subtype: "Link", rect: [0, 0, 5, 5], url: "javascript:alert(1)" },
        { subtype: "Link", rect: [0, 0, 5, 5], url: "data:text/html,<script>" },
        { subtype: "Link", rect: [0, 0, 5, 5], url: "file:///etc/passwd" },
      ],
      { width: 100, height: 100, transform: [1, 0, 0, -1, 0, 100] }
    );
    assert.equal(links.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Integration binding: the converter must actually use this module.
// ---------------------------------------------------------------------------

describe("converter wiring", () => {
  test("pdf-converter uses the invisible text layer and link copying", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const src = await readFile(
      fileURLToPath(new URL("../src/lib/pdf-converter.ts", import.meta.url)),
      "utf8"
    );
    assert.ok(src.includes("buildTextLayer"));
    assert.ok(src.includes("drawInvisibleTextLayer"));
    assert.ok(src.includes("copyLinkAnnotations"));
    assert.ok(
      src.includes("getTextContent"),
      "converter extracts text from the source PDF"
    );
  });
});
