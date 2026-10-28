/**
 * Output validation — a conversion is only "successful" if the bytes it
 * produced can actually be opened as the format they claim to be.
 *
 * Historically the orchestrator marked any non-throwing converter run as
 * completed, so a truncated or empty output (encoder failure, browser memory
 * exhaustion mid-save, a converter bug) still produced a "Complete!" card and
 * a download that no application could open. These checks run before the
 * success path is allowed to fire.
 *
 * Pure Node-testable: pdf-lib and JSZip are the same libraries the converters
 * use, and neither needs a browser.
 */

import type { Conversion } from "@/types";

export type OutputFormat = Conversion["fileType"];

/** Thrown when an output fails validation. Message is user-facing. */
export class OutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutputValidationError";
  }
}

function toBytes(data: Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Minimum plausible size of a real converted document (bytes). */
const MIN_OUTPUT_BYTES = 64;

function assertMagic(data: Uint8Array, magic: number[], label: string): void {
  if (data.length < Math.max(MIN_OUTPUT_BYTES, magic.length)) {
    throw new OutputValidationError(
      `The converted ${label} is empty or truncated (${data.length} bytes).`
    );
  }
  for (let i = 0; i < magic.length; i++) {
    if (data[i] !== magic[i]) {
      throw new OutputValidationError(
        `The converted ${label} is not a valid ${label.toUpperCase()} file.`
      );
    }
  }
}

/**
 * Validate a converted PDF: magic bytes, parseable structure, and — when the
 * source page count is known — the expected number of pages.
 *
 * Parsing is deliberately lazy (pdf-lib does not decode content streams), so
 * this stays cheap even for large outputs.
 */
export async function validatePdfOutput(
  data: Uint8Array,
  expectedPages?: number
): Promise<void> {
  const bytes = toBytes(data);
  assertMagic(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], "PDF"); // %PDF-

  const { PDFDocument } = await import("pdf-lib");
  let doc: import("pdf-lib").PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (err) {
    throw new OutputValidationError(
      `The converted PDF could not be opened (${err instanceof Error ? err.message : String(err)}).`
    );
  }
  const pages = doc.getPageCount();
  if (pages < 1) {
    throw new OutputValidationError("The converted PDF contains no pages.");
  }
  if (expectedPages !== undefined && pages !== expectedPages) {
    throw new OutputValidationError(
      `The converted PDF has ${pages} pages but the source has ${expectedPages}.`
    );
  }
}

/** OOXML/ZIP magic: PK\x03\x04 */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Parts every converted DOCX must contain to open in Word. */
export const REQUIRED_DOCX_PARTS = ["[Content_Types].xml", "word/document.xml"] as const;

/** Parts every converted PPTX must contain to open in PowerPoint. */
export const REQUIRED_PPTX_PARTS = [
  "[Content_Types].xml",
  "ppt/presentation.xml",
] as const;

/**
 * Validate a converted Office document: ZIP magic, loadable package, and the
 * structural parts the target application needs to open it at all.
 */
export async function validateZipOutput(
  data: Uint8Array,
  requiredParts: readonly string[],
  label: string
): Promise<void> {
  const bytes = toBytes(data);
  assertMagic(bytes, ZIP_MAGIC, label);

  const JSZip = (await import("jszip")).default;
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    throw new OutputValidationError(
      `The converted ${label} package could not be opened (${err instanceof Error ? err.message : String(err)}).`
    );
  }
  const missing = requiredParts.filter((part) => zip.file(part) == null);
  if (missing.length > 0) {
    throw new OutputValidationError(
      `The converted ${label} is missing required parts: ${missing.join(", ")}.`
    );
  }
}

/**
 * Validate the converter output for a given format. Called by the
 * orchestrator before any success callback can fire.
 */
export async function validateConversionOutput(
  data: Uint8Array,
  format: OutputFormat,
  expectedPages?: number
): Promise<void> {
  if (format === "pdf") {
    await validatePdfOutput(data, expectedPages);
  } else if (format === "docx") {
    await validateZipOutput(data, REQUIRED_DOCX_PARTS, "DOCX");
  } else {
    await validateZipOutput(data, REQUIRED_PPTX_PARTS, "PPTX");
  }
}

/**
 * Validate the Blob that will back the download link. A zero-byte or
 * missing blob must never reach `onComplete`.
 */
export function validateOutputBlob(blob: Blob | null | undefined): asserts blob is Blob {
  if (!blob || blob.size === 0) {
    throw new OutputValidationError(
      "The browser could not produce a downloadable file (empty output)."
    );
  }
}
