/**
 * Noctra DOCX dark-mode conversion engine.
 *
 * DOCX is an OOXML ZIP package. This transformer edits the document XML,
 * styles, numbering, headers/footers and theme in place, leaving the package's
 * text, relationships, media, equations and layout data editable. Images are
 * intentionally not rasterised or recoloured: their original bytes remain
 * untouched and continue to be referenced by the same relationships.
 *
 * This is deliberately a structural DOCX transform, not a DOCX renderer. A
 * browser-side PDF export is not claimed because reliable Office pagination
 * requires LibreOffice/Microsoft Office or a separately managed worker.
 */

import JSZip from "jszip";

const DARK_BG_HEX = "12121A";
const DARK_SURFACE_HEX = "1C1C26";
const LIGHT_TEXT_HEX = "E6E6EB";

const WORD_XML = /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)[^/]*\.xml$/i;
const STYLE_XML = /^word\/(styles|numbering)\.xml$/i;

export async function convertDocxToDarkMode(
  inputBuffer: ArrayBuffer,
  onProgress?: (part: number, total: number) => void
): Promise<Uint8Array> {
  if (inputBuffer.byteLength === 0) {
    throw new Error("The DOCX file is empty.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(inputBuffer);
  } catch {
    throw new Error("The DOCX file is not a readable ZIP package.");
  }

  const document = zip.file("word/document.xml");
  if (!document || !zip.file("[Content_Types].xml")) {
    throw new Error("The file is not a valid DOCX package (word/document.xml is missing).");
  }

  const names = Object.keys(zip.files).filter(
    (name) => WORD_XML.test(name) || STYLE_XML.test(name) || /^word\/theme\/theme\d+\.xml$/i.test(name)
  );
  const total = Math.max(names.length, 1);

  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    const xml = await entry.async("string");
    const transformed = /theme\/theme\d+\.xml$/i.test(name)
      ? patchThemeXml(xml)
      : patchWordXml(xml);
    zip.file(name, transformed);
    onProgress?.(index + 1, total);
  }

  return zip.generateAsync({ type: "uint8array" });
}

/** Apply conservative, context-aware replacements to editable OOXML. */
export function patchWordXml(xml: string): string {
  let output = xml;

  // Section/document page backgrounds and Word shading use six-digit RGB.
  output = output.replace(
    /(<w:background\b[^>]*\bw:color=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix) => `${prefix}${mapBackground(hex)}${suffix}`
  );
  output = output.replace(
    /(<w:shd\b[^>]*\bw:fill=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix) => `${prefix}${mapFill(hex)}${suffix}`
  );
  output = output.replace(
    /(<w:highlight\b[^>]*\bw:val=")white(")/gi,
    `$1darkGray$2`
  );

  // Direct and style-level run colours. Theme colours are left as theme
  // references so patching the theme keeps inheritance and editability.
  output = output.replace(
    /(<w:color\b[^>]*\bw:val=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix) => `${prefix}${mapText(hex)}${suffix}`
  );

  // Table borders, paragraph borders and drawing fills are independent from
  // text; map only neutral colours and keep accents, photos and diagrams.
  output = output.replace(
    /(<w:(?:top|left|bottom|right|insideH|insideV|start|end)\b[^>]*\bw:color=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix) => `${prefix}${mapNeutral(hex)}${suffix}`
  );
  output = patchDrawingColors(output);

  return output;
}

function patchDrawingColors(xml: string): string {
  return xml.replace(
    /(<a:solidFill>\s*<a:srgbClr\b[^>]*\bval=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix, offset, source) => {
      const before = source.slice(0, offset);
      const inRunProperties = before.lastIndexOf("<a:rPr") > before.lastIndexOf("</a:rPr>");
      const mapped = inRunProperties ? mapText(hex) : mapFill(hex);
      return `${prefix}${mapped}${suffix}`;
    }
  );
}

export function patchThemeXml(xml: string): string {
  let output = xml;
  output = replaceThemeColor(output, "dk1", LIGHT_TEXT_HEX);
  output = replaceThemeColor(output, "lt1", DARK_BG_HEX);
  return output;
}

function replaceThemeColor(xml: string, name: string, value: string): string {
  const pattern = new RegExp(
    `<a:${name}>\\s*<(?:a:sysClr|a:srgbClr)\\b[^>]*\\/>\\s*<\\/a:${name}>`,
    "gi"
  );
  return xml.replace(pattern, `<a:${name}><a:srgbClr val="${value}"/></a:${name}>`);
}

function mapBackground(hex: string): string {
  const rgb = hexToRgb(hex);
  return isNearWhite(rgb) ? DARK_BG_HEX : mapNeutral(hex);
}

function mapFill(hex: string): string {
  const rgb = hexToRgb(hex);
  if (isNearWhite(rgb)) return DARK_SURFACE_HEX;
  if (isNearBlack(rgb)) return DARK_SURFACE_HEX;
  return hex.toUpperCase();
}

function mapText(hex: string): string {
  const rgb = hexToRgb(hex);
  return isNearBlack(rgb) ? LIGHT_TEXT_HEX : hex.toUpperCase();
}

function mapNeutral(hex: string): string {
  const rgb = hexToRgb(hex);
  if (isNearWhite(rgb)) return DARK_SURFACE_HEX;
  if (isNearBlack(rgb)) return LIGHT_TEXT_HEX;
  return hex.toUpperCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(hex, 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

function isNearWhite({ r, g, b }: { r: number; g: number; b: number }): boolean {
  return Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) < 36;
}

function isNearBlack({ r, g, b }: { r: number; g: number; b: number }): boolean {
  return Math.max(r, g, b) <= 70 && Math.max(r, g, b) - Math.min(r, g, b) < 36;
}
