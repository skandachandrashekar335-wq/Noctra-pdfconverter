import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { convertPdfToDarkMode } from "../src/lib/pdf-converter.ts";

describe("convertPdfToDarkMode — invalid input", () => {
  test("rejects a buffer that is not a PDF", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    await assert.rejects(() => convertPdfToDarkMode(garbage));
  });

  test("rejects an empty input", async () => {
    await assert.rejects(() => convertPdfToDarkMode(new ArrayBuffer(0)));
  });
});

describe("privacy: no third-party worker fetch", () => {
  test("the PDF converter source references no external CDN", async () => {
    const srcPath = fileURLToPath(
      new URL("../src/lib/pdf-converter.ts", import.meta.url)
    );
    const src = await readFile(srcPath, "utf8");
    assert.ok(!/cdnjs|unpkg|jsdelivr|cloudflare/i.test(src));
    assert.ok(
      !/https?:\/\/[^"'`\s]*pdf\.worker/i.test(src),
      "worker must be bundled, not fetched from a remote host"
    );
  });
});
