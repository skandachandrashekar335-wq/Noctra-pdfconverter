/**
 * End-to-end regression test for the "stuck at 5%" bug.
 *
 * Scenario reproduced here: a history backend that never acknowledges the
 * record creation (infinite pending — exactly what Firestore did when the
 * Cloud Firestore API was disabled on the project, and exactly what a slow,
 * offline or misconfigured Supabase would do). The conversion is fully
 * in-browser, so `runConversion` must still finish and call `onComplete`
 * instead of freezing at "Preparing…".
 *
 * Uses a synthetic PPTX (JSZip only — no canvas/worker needed in Node).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { HistoryStore } from "../src/lib/history-tracker.ts";
import { revokeObjectUrl } from "../src/lib/temp-resources.ts";

const { runConversion, deriveOutputFileName } = await import(
  "../src/lib/conversion.ts"
);

// ─── Minimal valid PPTX (mirrors tests/pptx-converter.test.ts) ───────────────

async function buildPptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
</p:presentation>`
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/slideMasters/slideMaster1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400">
    <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
  </a:defRPr></a:lvl1pPr></p:titleStyle></p:txStyles></p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`
  );
  zip.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/slideLayouts/slideLayout1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld name="Title Slide"><p:spTree><p:sp>
    <p:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:spPr>
  </p:sp></p:spTree></p:cSld>
</p:sldLayout>`
  );
  zip.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`
  );
  zip.file(
    "ppt/theme/theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test">
  <a:themeElements><a:clrScheme name="Office">
    <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
    <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
    <a:dk2><a:srgbClr val="44546A"/></a:dk2>
    <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
    <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
  </a:clrScheme></a:themeElements>
</a:theme>`
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r>
    <a:rPr lang="en-US"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr>
    <a:t>Dark body text</a:t>
  </a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

/** Wrap the synthetic PPTX bytes in a File, ready for `runConversion`. */
async function buildFile(name = "lecture.pptx"): Promise<File> {
  const bytes = await buildPptx();
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  // File is global in Node ≥ 20
  return new File([ab], name, {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

// ─── The regression ──────────────────────────────────────────────────────────

/** A backend whose `create` never settles — the original hang, verbatim. */
const hangingStore: HistoryStore = {
  create: () => new Promise<string>(() => {}),
  update: async () => {},
};

describe("runConversion with a history backend that never responds", () => {
  test("rejects invalid files before starting conversion or history", async () => {
    const invalid = new File([new Uint8Array([1, 2, 3])], "payload.exe", {
      type: "application/pdf",
    });
    let conversionError: string | null = null;
    let completed = false;

    await runConversion(
      invalid,
      {
        onError: (message) => {
          conversionError = message;
        },
        onComplete: () => {
          completed = true;
        },
      },
      {
        historyStore: {
          create: async () => {
            throw new Error("history must not start for invalid input");
          },
          update: async () => {},
        },
      }
    );

    assert.equal(completed, false);
    assert.match(conversionError ?? "", /Only PDF, DOCX and PPTX files are supported/);
  });

  test("honours an already-aborted signal without reporting a conversion failure", async () => {
    const file = await buildFile("cancelled.pptx");
    const controller = new AbortController();
    controller.abort();
    let cancelled = false;
    let completed = false;
    let errored = false;
    const statuses: string[] = [];
    await runConversion(file, {
      signal: controller.signal,
      onStatusChange: (status) => statuses.push(status),
      onCancelled: () => { cancelled = true; },
      onComplete: () => { completed = true; },
      onError: () => { errored = true; },
    }, { historyStore: null });
    assert.equal(cancelled, true);
    assert.equal(completed, false);
    assert.equal(errored, false);
    assert.deepEqual(statuses, ["cancelled"]);
  });

  test("conversion completes even though history creation never settles", async () => {
    const file = await buildFile();

    const statuses: string[] = [];
    let completed: string | null = null;
    let errored: string | null = null;

    // Race against a deadline: the old code awaited addDoc() here and never
    // returned (the SDK retries an unreachable backend indefinitely), which
    // surfaced in the UI as a permanent 5% "Preparing…".
    let deadline;
    try {
      await Promise.race([
        runConversion(
          file,
          {
            onStatusChange: (s) => statuses.push(s),
            onProgress: () => {},
            onComplete: (url) => {
              completed = url;
            },
            onError: (m) => {
              errored = m;
            },
          },
          { historyStore: hangingStore }
        ),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () =>
              reject(
                new Error(
                  "runConversion hung — history writes are blocking the conversion"
                )
              ),
            20_000
          );
        }),
      ]);
    } finally {
      clearTimeout(deadline); // else the timer holds the event loop open
    }

    assert.equal(errored, null, `conversion errored: ${errored}`);
    assert.ok(completed, "onComplete must fire (output blob URL)");
    assert.match(completed, /^blob:/);
    assert.ok(
      statuses.includes("processing"),
      "UI status callback must fire so the progress bar leaves 5%"
    );
  });

  test("a rejected store fails history only, never the conversion", async () => {
    const file = await buildFile();

    let completed: string | null = null;
    let conversionError: string | null = null;
    let historyError: string | null = null;
    const statuses: string[] = [];

    await runConversion(
      file,
      {
        onStatusChange: (s) => statuses.push(s),
        onProgress: () => {},
        onComplete: (url) => {
          completed = url;
        },
        onError: (m) => {
          conversionError = m;
        },
        onHistoryError: (m) => {
          historyError = m;
        },
      },
      {
        historyStore: {
          create: async () => {
            throw new Error("supabase unreachable");
          },
          update: async () => {},
        },
      }
    );

    assert.ok(completed, "the conversion must still produce a download");
    assert.equal(conversionError, null, "conversion must not be reported failed");
    assert.ok(
      statuses.includes("processing"),
      "status must advance so the UI never sits at 5%"
    );
    // The failure is surfaced through the *history* channel — the requirement
    // is a clear history error that does not falsely claim conversion failed.
    assert.ok(historyError, "onHistoryError must fire so the UI can say so");
    assert.match(historyError, /history/i);
  });

  test("output filename derivation is shared by the UI and the record", () => {
    assert.equal(deriveOutputFileName("lecture.pptx"), "lecture-dark.pptx");
    assert.equal(deriveOutputFileName("notes.pdf"), "notes-dark.pdf");
    assert.equal(deriveOutputFileName("notes.docx"), "notes-dark.docx");
    assert.equal(
      deriveOutputFileName("deck.PPTX"),
      "deck-dark.PPTX",
      "extension matching is case-insensitive"
    );
  });

  test("releasing the temporary output URL does not remove history metadata", async () => {
    const file = await buildFile("retained-history.pptx");
    const writes: Array<Record<string, unknown>> = [];
    let outputUrl: string | null = null;
    const store: HistoryStore = {
      create: async () => "conversion-1",
      update: async (_id, data) => { writes.push(data); },
    };

    await runConversion(file, {
      onComplete: (url) => { outputUrl = url; },
    }, { historyStore: store });
    assert.ok(outputUrl);
    revokeObjectUrl(outputUrl);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.ok(writes.some((write) => write.status === "completed"));
    assert.equal(writes.some((write) => "outputUrl" in write || "outputBytes" in write), false);
  });
});
