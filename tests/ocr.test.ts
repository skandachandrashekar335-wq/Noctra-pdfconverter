import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { hasUsableText, ocrCapabilityMessage } from "../src/lib/ocr.ts";

describe("OCR capability boundary", () => {
  test("detects pages with usable extracted text", () => {
    assert.equal(hasUsableText([{ str: "Chapter 1" }]), true);
    assert.equal(hasUsableText([{ str: "   " }, { type: "marker" }]), false);
  });

  test("reports the honest unavailable state", () => {
    assert.match(ocrCapabilityMessage(), /not configured/i);
    assert.match(ocrCapabilityMessage(), /searchable/i);
  });
});
