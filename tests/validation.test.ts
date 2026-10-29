import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateFile,
  detectFileType,
  MAX_FILE_SIZE_BYTES,
  validateEmail,
  validatePassword,
  validateSafeText,
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

describe("form and input validation", () => {
  describe("validateEmail", () => {
    test("accepts valid email addresses", () => {
      assert.deepEqual(validateEmail("user@example.com"), { valid: true });
      assert.deepEqual(validateEmail("first.last@domain.co.uk"), { valid: true });
      assert.deepEqual(validateEmail("student+tag@university.edu"), { valid: true });
    });

    test("rejects empty or non-string email", () => {
      assert.equal(validateEmail("").valid, false);
      assert.equal(validateEmail("   ").valid, false);
      assert.equal(validateEmail(null).valid, false);
      assert.equal(validateEmail(undefined).valid, false);
    });

    test("rejects malformed email formats", () => {
      assert.equal(validateEmail("plainaddress").valid, false);
      assert.equal(validateEmail("@missinguser.com").valid, false);
      assert.equal(validateEmail("missingdomain@").valid, false);
      assert.equal(validateEmail("user@domain..com").valid, false);
    });

    test("rejects excessively long email addresses", () => {
      const longEmail = `${"a".repeat(250)}@example.com`;
      assert.equal(validateEmail(longEmail).valid, false);
    });
  });

  describe("validatePassword", () => {
    test("accepts passwords of 8 or more characters", () => {
      assert.deepEqual(validatePassword("password123"), { valid: true });
      assert.deepEqual(validatePassword("correct-horse-battery-staple"), { valid: true });
    });

    test("rejects passwords under 8 characters", () => {
      assert.equal(validatePassword("1234567").valid, false);
      assert.equal(validatePassword("short").valid, false);
    });

    test("rejects empty or non-string passwords", () => {
      assert.equal(validatePassword("").valid, false);
      assert.equal(validatePassword(null).valid, false);
    });

    test("rejects passwords exceeding 128 characters", () => {
      const longPass = "x".repeat(129);
      assert.equal(validatePassword(longPass).valid, false);
    });
  });

  describe("validateSafeText", () => {
    test("validates text length constraints", () => {
      assert.deepEqual(validateSafeText("Valid Label", { minLength: 1, maxLength: 50 }), { valid: true });
      assert.equal(validateSafeText("", { minLength: 1 }).valid, false);
      assert.equal(validateSafeText("Too long string", { maxLength: 5 }).valid, false);
    });
  });
});
