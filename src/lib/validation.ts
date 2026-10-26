/**
 * Pure file-validation helpers.
 *
 * Kept free of Firebase/Next.js imports so they can be unit tested directly
 * with `node --test` (no credentials or browser required).
 */

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const SUPPORTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

export type SupportedExtension = "pdf" | "docx" | "pptx";

/** Minimal file shape (File is structurally compatible) */
export interface FileLike {
  name: string;
  type: string;
  size: number;
}

/** Extract the lowercase extension of a filename, or undefined */
function extensionOf(name: string): string | undefined {
  return name.split(".").pop()?.toLowerCase();
}

/**
 * Validate a file's name/MIME/size before conversion.
 * Returns an error message, or null when the file is acceptable.
 */
export function validateFile(file: FileLike): string | null {
  if (file.size === 0) {
    return "File is empty (0 bytes) — nothing to convert.";
  }

  const ext = extensionOf(file.name);
  const hasSupportedExtension = ext === "pdf" || ext === "docx" || ext === "pptx";
  // A known-but-unsupported extension must not be accepted merely because a
  // caller supplied a trusted-looking MIME type. The converter chooses the
  // format from the extension, so accepting `malware.exe` as a PDF would send
  // the wrong bytes to the wrong engine and produce a misleading download.
  if (ext && !hasSupportedExtension) {
    return "Only PDF, DOCX and PPTX files are supported.";
  }

  if (
    !SUPPORTED_TYPES.includes(file.type as (typeof SUPPORTED_TYPES)[number])
  ) {
    // Some browsers/OSes report an empty or generic MIME type; fall back to
    // the file extension before rejecting.
    if (!hasSupportedExtension) {
      return "Only PDF, DOCX and PPTX files are supported.";
    }
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File exceeds the 50 MB limit (yours is ${(
      file.size /
      1024 /
      1024
    ).toFixed(1)} MB).`;
  }

  return null;
}

/**
 * Determine the converter to use. The extension wins when present because
 * MIME types are frequently missing (`""`) on desktop uploads.
 */
export function detectFileType(file: FileLike): "pdf" | "docx" | "pptx" {
  const ext = extensionOf(file.name);
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  return "pdf";
}
