/**
 * OCR capability boundary.
 *
 * No paid or remote OCR service is bundled. These helpers detect pages that
 * need OCR and describe the honest unavailable state so the UI never presents
 * a fake "OCR complete" result.
 */
export interface OcrPageInspection {
  pageNumber: number;
  hasUsableText: boolean;
}

export function hasUsableText(items: readonly unknown[]): boolean {
  return items.some((item) => {
    if (typeof item !== "object" || item === null) return false;
    const value = (item as { str?: unknown }).str;
    return typeof value === "string" && value.trim().length > 0;
  });
}

export function ocrCapabilityMessage(): string {
  return "OCR is not configured in this browser build. Scanned pages remain viewable, but their text cannot be made searchable here.";
}
