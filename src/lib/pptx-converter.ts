/**
 * Noctra PPTX Dark-Mode Conversion Engine
 *
 * Strategy:
 *  PPTX files are ZIP archives containing XML slide definitions.
 *  We parse the ZIP, locate slide XML files, and intelligently remap:
 *    - Solid white/light fills → dark background colour
 *    - Black/dark text → off-white text
 *    - Accent colours: preserved or slightly adjusted for contrast
 *    - Images and media: left untouched
 *    - Theme colours: patched at the theme XML level
 *
 *  This is a structural (vector-preserving) transform — the output remains
 *  a valid .pptx file with editable text, not a rasterised PDF.
 *
 * Limitations documented in README:
 *  - Complex gradient fills may not transform perfectly
 *  - Custom fonts embedded in the file are preserved as-is
 *  - SmartArt XML is partially supported
 */

import JSZip from "jszip";
import {
  getConversionProfile,
  type ConversionProfileId,
} from "./conversion-profiles.ts";

/** Convert a PPTX ArrayBuffer to a dark-mode PPTX Uint8Array */
export async function convertPptxToDarkMode(
  inputBuffer: ArrayBuffer,
  onProgress?: (slide: number, total: number) => void,
  profileId?: ConversionProfileId,
  signal?: AbortSignal,
  onFinalizing?: (label: string) => void,
  customColor?: string
): Promise<Uint8Array> {
  if (inputBuffer.byteLength === 0) {
    throw new Error("The PPTX file is empty.");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(inputBuffer);
  } catch {
    throw new Error("The PPTX file is not a readable ZIP package.");
  }

  if (!zip.file("[Content_Types].xml") || !zip.file("ppt/presentation.xml")) {
    throw new Error(
      "The file is not a valid PPTX package (ppt/presentation.xml is missing)."
    );
  }

  const profile = getConversionProfile(profileId, customColor);
  const palette = {
    background: rgbToHex(profile.background),
    surface: rgbToHex(profile.surface),
    text: rgbToHex(profile.text),
    accent: rgbToHex(profile.accent),
  };

  // 1. Patch the theme file(s) — these set master slide colours
  const themeFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/theme\/theme\d*\.xml$/.test(name)
  );
  for (const themeFile of themeFiles) {
    const xml = await zip.files[themeFile].async("string");
    zip.file(themeFile, patchThemeXml(xml, palette));
  }

  // 2. Patch slide master(s)
  const masterFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/slideMasters\/slideMaster\d*\.xml$/.test(name)
  );
  for (const masterFile of masterFiles) {
    const xml = await zip.files[masterFile].async("string");
    zip.file(masterFile, patchSlideXml(xml, true, palette));
  }

  // 3. Patch slide layout(s)
  const layoutFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)
  );
  for (const layoutFile of layoutFiles) {
    const xml = await zip.files[layoutFile].async("string");
    zip.file(layoutFile, patchSlideXml(xml, true, palette));
  }

  // 3b. Patch charts — plot-area/shape fills and data-label text live in
  // chart XML (c: namespace wrapping a: rich content), otherwise white
  // chart backgrounds survive on dark slides.
  const chartFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/charts\/chart\d+\.xml$/.test(name)
  );
  for (const chartFile of chartFiles) {
    const xml = await zip.files[chartFile].async("string");
    zip.file(chartFile, patchChartXml(xml, palette));
  }

  // 3c. Patch speaker-notes slides (typically black-on-white text)
  const notesFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)
  );
  for (const notesFile of notesFiles) {
    const xml = await zip.files[notesFile].async("string");
    zip.file(notesFile, patchSlideXml(xml, false, palette));
  }

  // 4. Patch individual slides
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || "0");
      const nb = parseInt(b.match(/\d+/)?.[0] || "0");
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new Error("The PPTX package contains no slides.");
  }

  for (let i = 0; i < slideFiles.length; i++) {
    if (signal?.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
    onProgress?.(i + 1, slideFiles.length);
    const xml = await zip.files[slideFiles[i]].async("string");
    zip.file(slideFiles[i], patchSlideXml(xml, false, palette));
  }

  // Repacking runs after the last slide tick — report it as finalization so
  // the UI keeps moving instead of freezing at the last percentage.
  onFinalizing?.("Repacking the PPTX archive…");
  if (signal?.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
  const outputBuffer = await zip.generateAsync({ type: "uint8array" });
  if (signal?.aborted) throw new DOMException("Conversion cancelled.", "AbortError");
  return outputBuffer;
}

/**
 * Patch the theme XML to set dk1 (dark 1) → light text, lt1 (light 1) → dark bg
 * This is the most impactful single change — themes propagate to all slides.
 */
type Palette = { background: string; surface: string; text: string; accent: string };

function patchThemeXml(xml: string, palette: Palette): string {
  // dk1: typically the text colour in light themes — remap to near-white
  xml = xml.replace(
    /<a:dk1>\s*<a:sysClr[^>]*lastClr="[0-9A-Fa-f]{6}"[^>]*\/>\s*<\/a:dk1>/g,
    `<a:dk1><a:srgbClr val="${palette.text}"/></a:dk1>`
  );
  xml = xml.replace(
    /<a:dk1>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"[^/]*\/>\s*<\/a:dk1>/g,
    `<a:dk1><a:srgbClr val="${palette.text}"/></a:dk1>`
  );

  // lt1: typically the background colour — remap to near-black
  xml = xml.replace(
    /<a:lt1>\s*<a:sysClr[^>]*lastClr="[0-9A-Fa-f]{6}"[^>]*\/>\s*<\/a:lt1>/g,
    `<a:lt1><a:srgbClr val="${palette.background}"/></a:lt1>`
  );
  xml = xml.replace(
    /<a:lt1>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"[^/]*\/>\s*<\/a:lt1>/g,
    `<a:lt1><a:srgbClr val="${palette.background}"/></a:lt1>`
  );

  // accent1 → our purple
  xml = xml.replace(
    /<a:accent1>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"[^/]*\/>\s*<\/a:accent1>/g,
    `<a:accent1><a:srgbClr val="${palette.accent}"/></a:accent1>`
  );

  return xml;
}

/**
 * Patch a single slide (or master/layout) XML.
 * Handles:
 *  - Solid colour fills (spPr/solidFill)
 *  - Text run colours (rPr)
 *  - Background colour (bg/bgPr)
 */
function patchSlideXml(xml: string, isMaster: boolean, palette: Palette): string {
  // 1. Slide/master/layout background (<p:bg>) → dark page colour
  xml = xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/g, (block) =>
    replaceSolidFillColors(block, true, palette)
  );

  // 2. Remaining shape / line / picture fills → dark surface (colourful kept)
  xml = replaceSolidFillColors(xml, false, palette);

  // 3. Gradient stops (white gradients otherwise survive as light blobs)
  xml = patchGradientFills(xml, false, palette);

  // 4. Text colours — MUST run after the fill passes. Explicit white text
  //    gets darkened by step 2/3 while still inside <a:rPr>, so the text pass
  //    recognises both original near-black and our converted dark palette and
  //    remaps them to light text (otherwise white text would become invisible).
  xml = replaceTextColors(xml, palette);

  // If it's a master slide, also patch the body text defaults
  if (isMaster) {
    xml = patchMasterDefaults(xml, palette);
  }

  return xml;
}

/** Same as patchSlideXml, minus background/master defaults — for chart parts */
function patchChartXml(xml: string, palette: Palette): string {
  xml = replaceSolidFillColors(xml, false, palette);
  xml = patchGradientFills(xml, false, palette);
  xml = replaceTextColors(xml, palette);
  return xml;
}

/**
 * Map a single solid-fill hex to the dark palette, or null to keep it.
 *  - Near-white fill → dark background / surface
 *  - Near-black fill → dark surface (never leave it invisible on dark bg)
 *  - Colourful fills preserved unchanged
 */
function mapFillColor(hex: string, isBackground: boolean, palette: Palette): string | null {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r + g + b) / 3;
  const saturation = getPerceivedSaturation(r, g, b);

  if (saturation < 25 && brightness > 180) {
    return isBackground ? palette.background : palette.surface;
  }
  if (saturation < 25 && brightness < 50) {
    return palette.surface;
  }
  return null;
}

/**
 * Replace solid fill colours that are near-white with our dark bg,
 * and near-black with our surface colour.
 */
function replaceSolidFillColors(xml: string, isBackground: boolean, palette: Palette): string {
  // Match: <a:solidFill><a:srgbClr val="RRGGBB"/></a:solidFill>
  return xml.replace(
    /<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"(\s*\/>|>(?:<\/a:srgbClr>)?)\s*<\/a:solidFill>/g,
    (match, hex) => {
      const mapped = mapFillColor(hex, isBackground, palette);
      if (!mapped) return match; // colourful / mid-tone: keep as-is
      return `<a:solidFill><a:srgbClr val="${mapped}"/></a:solidFill>`;
    }
  );
}

/**
 * Map gradient stops (<a:gs>) with the same fill rules, so white gradients
 * (common as subtle page/card shading) don't survive as light blobs.
 */
function patchGradientFills(xml: string, isBackground: boolean, palette: Palette): string {
  return xml.replace(
    /<a:gs(?:\s[^>]*)?>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/g,
    (match, hex) => {
      const mapped = mapFillColor(hex, isBackground, palette);
      if (!mapped) return match;
      return match.replace(hex, mapped);
    }
  );
}

/** Replace explicit text run colours */
function replaceTextColors(xml: string, palette: Palette): string {
  // Match <a:rPr ...> that contains a solidFill with near-black colour
  // Simple approach: replace srgbClr inside <a:solidFill> within <a:rPr> context
  return xml.replace(
    /(<a:rPr[^>]*>(?:(?!<\/a:rPr>)[\s\S])*?<a:solidFill>\s*<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g,
    (match, prefix, hex, suffix) => {
       if (isTextDarkOnDark(hex, palette)) {
        // Near-black text, or a dark-palette colour produced by the fill
        // pass (which also catches explicit white text that got darkened
        // first) → off-white
        return `${prefix}${palette.text}${suffix}`;
      }
      // White / colourful text is legible as-is — keep it
      return match;
    }
  );
}

/** True when a text-run colour would be unreadable on the dark background */
function isTextDarkOnDark(hex: string, palette?: Palette): boolean {
  if (palette && (hex.toUpperCase() === palette.background || hex.toUpperCase() === palette.surface)) {
    return true;
  }
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r + g + b) / 3;
  const saturation = getPerceivedSaturation(r, g, b);
  return saturation < 25 && brightness < 80;
}

function patchMasterDefaults(xml: string, palette: Palette): string {
  // Patch any defRPr (default run properties) colours
  return xml.replace(
    /(<a:defRPr[^>]*>(?:(?!<\/a:defRPr>)[\s\S])*?<a:solidFill>\s*<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g,
    (match, prefix, hex, suffix) => {
      if (isTextDarkOnDark(hex, palette)) {
        return `${prefix}${palette.text}${suffix}`;
      }
      return match;
    }
  );
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return [r, g, b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// ─── Colour utilities ────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function getPerceivedSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return ((max - min) / max) * 100;
}
