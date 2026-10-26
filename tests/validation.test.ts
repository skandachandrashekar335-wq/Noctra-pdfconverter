import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateFile,
  detectFileType,
  MAX_FILE_SIZE_BYTES,
} from "../src/lib/validation.ts";

describe("validateFile", () => {
  test("accepts a normal PDF", () => {
    assert.equal(
      validateFile({ name: "notes.pdf", type: "application/pdf", size: 2048 }),
      null
    );
  });

  test("accepts a normal PPTX", () => {
    assert.equal(
      validateFile({
        name: "lecture.pptx",
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        size: 4096,
      }),
      null
    );
  });

  test("accepts a normal DOCX", () => {
    assert.equal(
      validateFile({
        name: "notes.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: 4096,
      }),
      null
    );
  });

  test("accepts a PDF whose MIME type is missing (extension fallback)", () => {
    assert.equal(
      validateFile({ name: "scan.pdf", type: "", size: 1024 }),
      null
    );
  });

  test("accepts a PPTX with a wrong MIME type via extension fallback", () => {
    assert.equal(
      validateFile({ name: "deck.pptx", type: "application/octet-stream", size: 1024 }),
      null
    );
  });

  test("rejects unsupported type and extension", () => {
    const err = validateFile({ name: "photo.png", type: "image/png", size: 1024 });
    assert.ok(err);
    assert.match(err!, /Only PDF, DOCX and PPTX files are supported/);
  });

  test("rejects an unsupported filename extension even with a PDF MIME type", () => {
    const err = validateFile({ name: "payload.exe", type: "application/pdf", size: 1024 });
    assert.ok(err);
    assert.match(err!, /Only PDF, DOCX and PPTX files are supported/);
  });

  test("rejects files without extension and unsupported MIME type", () => {
    const err = validateFile({ name: "README", type: "text/plain", size: 10 });
    assert.ok(err);
  });

  test("rejects an empty file", () => {
    const err = validateFile({ name: "empty.pdf", type: "application/pdf", size: 0 });
    assert.ok(err);
    assert.match(err!, /empty/i);
  });

  test("rejects a file over the 50 MB limit", () => {
    const err = validateFile({
      name: "huge.pdf",
      type: "application/pdf",
      size: MAX_FILE_SIZE_BYTES + 1,
    });
    assert.ok(err);
    assert.match(err!, /50 MB limit/);
    assert.match(err!, /50\.0 MB/);
  });

  test("accepts a file exactly at the size limit", () => {
    assert.equal(
      validateFile({
        name: "edge.pdf",
        type: "application/pdf",
        size: MAX_FILE_SIZE_BYTES,
      }),
      null
    );
  });
});

describe("detectFileType", () => {
  test("detects pptx by extension (case-insensitive)", () => {
    assert.equal(
      detectFileType({ name: "DECK.PPTX", type: "", size: 1 }),
      "pptx"
    );
  });

  test("detects docx by extension (case-insensitive)", () => {
    assert.equal(detectFileType({ name: "NOTES.DOCX", type: "", size: 1 }), "docx");
  });

  test("defaults to pdf", () => {
    assert.equal(detectFileType({ name: "doc.pdf", type: "", size: 1 }), "pdf");
    assert.equal(detectFileType({ name: "unknown", type: "", size: 1 }), "pdf");
  });

  test("extension wins over a misleading MIME type", () => {
    assert.equal(
      detectFileType({ name: "deck.pptx", type: "application/pdf", size: 1 }),
      "pptx"
    );
  });
});
