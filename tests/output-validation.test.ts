/**
 * Output-validation regression tests.
 *
 * A conversion must not be reported as successful unless its bytes actually
 * open as the format they claim to be. These checks sit between the
 * converters and `onComplete` — a truncated or empty output has to land on
 * the error path, not on a "Complete!" card with an undownloadable file.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import {
  validatePdfOutput,
  validateZipOutput,
  validateConversionOutput,
  validateOutputBlob,
  OutputValidationError,
  REQUIRED_DOCX_PARTS,
  REQUIRED_PPTX_PARTS,
} from "../src/lib/output-validation.ts";

async function pdfBytes(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

async function zipBytes(parts: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(parts)) zip.file(name, body);
  return zip.generateAsync({ type: "uint8array" });
}

describe("validatePdfOutput", () => {
  test("accepts a real PDF with the expected page count", async () => {
    await validatePdfOutput(await pdfBytes(3), 3); // must not throw
  });

  test("rejects an empty output", async () => {
    await assert.rejects(
      () => validatePdfOutput(new Uint8Array(0)),
      OutputValidationError
    );
  });

  test("rejects bytes that are not a PDF at all", async () => {
    const junk = new Uint8Array(200).fill(0x41); // "AAAA…" — no %PDF- magic
    await assert.rejects(
      () => validatePdfOutput(junk),
      /not a valid PDF/i
    );
  });

  test("rejects a truncated PDF (valid magic, unparseable body)", async () => {
    const head = new TextEncoder().encode("%PDF-\n");
    const garbage = new Uint8Array(200).fill(0x7a);
    const truncated = new Uint8Array(head.length + garbage.length);
    truncated.set(head, 0);
    truncated.set(garbage, head.length);
    await assert.rejects(
      () => validatePdfOutput(truncated),
      OutputValidationError
    );
  });

  test("rejects a page-count mismatch against the source", async () => {
    const onePage = await pdfBytes(1);
    await assert.rejects(
      () => validatePdfOutput(onePage, 13),
      /1 pages but the source has 13/i
    );
  });
});

describe("validateZipOutput", () => {
  test("accepts a DOCX package with its required parts", async () => {
    const parts: Record<string, string> = {};
    for (const part of REQUIRED_DOCX_PARTS) parts[part] = "<xml/>";
    await validateZipOutput(await zipBytes(parts), REQUIRED_DOCX_PARTS, "DOCX");
  });

  test("rejects a DOCX missing word/document.xml and names the missing part", async () => {
    const bytes = await zipBytes({ "[Content_Types].xml": "<xml/>" });
    await assert.rejects(
      () => validateZipOutput(bytes, REQUIRED_DOCX_PARTS, "DOCX"),
      /word\/document\.xml/
    );
  });

  test("accepts a PPTX package with its required parts", async () => {
    const parts: Record<string, string> = {};
    for (const part of REQUIRED_PPTX_PARTS) parts[part] = "<xml/>";
    await validateZipOutput(await zipBytes(parts), REQUIRED_PPTX_PARTS, "PPTX");
  });

  test("rejects non-ZIP bytes", async () => {
    const junk = new Uint8Array(200).fill(0x42);
    await assert.rejects(
      () => validateZipOutput(junk, REQUIRED_DOCX_PARTS, "DOCX"),
      /not a valid DOCX/i
    );
  });
});

describe("validateConversionOutput (dispatch)", () => {
  test("routes each format to its validator", async () => {
    await validateConversionOutput(await pdfBytes(2), "pdf", 2);

    const docxParts: Record<string, string> = {};
    for (const part of REQUIRED_DOCX_PARTS) docxParts[part] = "<xml/>";
    await validateConversionOutput(await zipBytes(docxParts), "docx");

    const pptxParts: Record<string, string> = {};
    for (const part of REQUIRED_PPTX_PARTS) pptxParts[part] = "<xml/>";
    await validateConversionOutput(await zipBytes(pptxParts), "pptx");

    await assert.rejects(
      () => validateConversionOutput(new Uint8Array(100), "pdf"),
      OutputValidationError
    );
  });
});

describe("validateOutputBlob", () => {
  test("rejects null and zero-byte blobs", () => {
    assert.throws(() => validateOutputBlob(null), OutputValidationError);
    assert.throws(() => validateOutputBlob(new Blob([])), OutputValidationError);
  });

  test("accepts a non-empty blob", () => {
    validateOutputBlob(new Blob([new Uint8Array([1, 2, 3])]));
  });
});
