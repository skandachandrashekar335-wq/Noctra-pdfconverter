/**
 * Regression test for the "stuck at 96% — Validating output…" bug.
 *
 * Reproduced here: after the converter returns, the orchestrator runs output
 * validation (`import("pdf-lib")` + `PDFDocument.load`, or `import("jszip")`
 * for Office docs). If that validation await never settles — a stalled dynamic
 * chunk fetch, a wedged parser — the UI sits at 92–99% "Validating output…"
 * forever. The old code awaited it with no stage-scoped guard, so only the
 * generic 120s watchdog (vague message) could eventually unblock it.
 *
 * The fix adds a stage-scoped timeout that fails with a validation-specific,
 * actionable message instead of leaving the card frozen, while leaving slow but
 * healthy validation well inside the bound.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import type { ConverterFn } from "../src/lib/conversion.ts";

const { runConversion } = await import("../src/lib/conversion.ts");

async function pptxBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`
  );
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function pptxFile(name = "stall.pptx"): Promise<File> {
  const bytes = await pptxBytes();
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  return new File([ab], name, {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

describe("output validation stall (stuck at 96%)", () => {
  test("a validator that never settles fails with a validation-stage message", async () => {
    const file = await pptxFile();
    // A converter that returns valid bytes instantly…
    const runConverter: ConverterFn = async () => ({
      bytes: await pptxBytes(),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pageCount: 1,
    });
    // …but a validator that hangs forever — exactly the observed stall.
    const hangingValidator = () => new Promise<void>(() => {});

    let error: string | null = null;
    let completed = false;
    const finalizing: string[] = [];

    await runConversion(
      file,
      {
        onFinalizing: (label) => finalizing.push(label),
        onComplete: () => {
          completed = true;
        },
        onError: (m) => {
          error = m;
        },
      },
      {
        historyStore: null,
        runConverter,
        validateOutput: hangingValidator,
        validationTimeoutMs: 300, // scoped short for the test
      }
    );

    assert.equal(completed, false, "a hung validation must never report success");
    assert.ok(
      finalizing.includes("Validating output…"),
      "the finalizing phase must be entered before validation"
    );
    assert.ok(error, "onError must fire");
    assert.match(
      error ?? "",
      /validat/i,
      `the error must identify the validation stage, got: ${error}`
    );
    assert.doesNotMatch(
      error ?? "",
      /stopped responding/i,
      "the stage-scoped timeout must beat the generic watchdog"
    );
  });

  test("slow-but-healthy validation is NOT killed by the scoped timeout", async () => {
    const file = await pptxFile();
    const runConverter: ConverterFn = async () => ({
      bytes: await pptxBytes(),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pageCount: 1,
    });
    let completed = false;
    let error: string | null = null;

    await runConversion(
      file,
      {
        onComplete: () => {
          completed = true;
        },
        onError: (m) => {
          error = m;
        },
      },
      {
        historyStore: null,
        runConverter,
        // A validator that takes 150ms — slow relative to the 1s floor but
        // comfortably inside a generous bound; must succeed.
        validateOutput: () => new Promise((r) => setTimeout(r, 150)),
        validationTimeoutMs: 5_000,
      }
    );

    assert.equal(error, null, `slow validation must not fail, got: ${error}`);
    assert.ok(completed, "slow-but-healthy validation must still complete");
  });

  test("a validator that rejects propagates its own actionable message", async () => {
    const file = await pptxFile();
    const runConverter: ConverterFn = async () => ({
      bytes: await pptxBytes(),
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      pageCount: 1,
    });
    let error: string | null = null;

    await runConversion(
      file,
      {
        onError: (m) => {
          error = m;
        },
      },
      {
        historyStore: null,
        runConverter,
        validateOutput: async () => {
          throw new Error("The converted PPTX is missing required parts: slide1.xml");
        },
        validationTimeoutMs: 5_000,
      }
    );

    assert.ok(error, "onError must fire");
    assert.match(error ?? "", /missing required parts/);
  });
});
