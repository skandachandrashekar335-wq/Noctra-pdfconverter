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

// Target dark palette (as hex for XML)
const DARK_BG_HEX = "12121A";
const DARK_SURFACE_HEX = "1C1C26";
const LIGHT_TEXT_HEX = "E6E6EB";
const ACCENT_HEX = "7C6DFF"; // purple accent

/** Convert a PPTX ArrayBuffer to a dark-mode PPTX Uint8Array */
export async function convertPptxToDarkMode(
  inputBuffer: ArrayBuffer,
  onProgress?: (slide: number, total: number) => void
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

  // 1. Patch the theme file(s) — these set master slide colours
  const themeFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/theme\/theme\d*\.xml$/.test(name)
  );
  for (const themeFile of themeFiles) {
    const xml = await zip.files[themeFile].async("string");
    zip.file(themeFile, patchThemeXml(xml));
  }

  // 2. Patch slide master(s)
  const masterFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/slideMasters\/slideMaster\d*\.xml$/.test(name)
  );
  for (const masterFile of masterFiles) {
    const xml = await zip.files[masterFile].async("string");
    zip.file(masterFile, patchSlideXml(xml, true));
  }

  // 3. Patch slide layout(s)
  const layoutFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)
  );
  for (const layoutFile of layoutFiles) {
    const xml = await zip.files[layoutFile].async("string");
    zip.file(layoutFile, patchSlideXml(xml, true));
  }

  // 3b. Patch charts — plot-area/shape fills and data-label text live in
  // chart XML (c: namespace wrapping a: rich content), otherwise white
  // chart backgrounds survive on dark slides.
  const chartFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/charts\/chart\d+\.xml$/.test(name)
  );
  for (const chartFile of chartFiles) {
    const xml = await zip.files[chartFile].async("string");
    zip.file(chartFile, patchChartXml(xml));
  }

  // 3c. Patch speaker-notes slides (typically black-on-white text)
  const notesFiles = Object.keys(zip.files).filter((name) =>
    /ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)
  );
  for (const notesFile of notesFiles) {
    const xml = await zip.files[notesFile].async("string");
    zip.file(notesFile, patchSlideXml(xml, false));
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
    onProgress?.(i + 1, slideFiles.length);
    const xml = await zip.files[slideFiles[i]].async("string");
    zip.file(slideFiles[i], patchSlideXml(xml, false));
  }

  const outputBuffer = await zip.generateAsync({ type: "uint8array" });
  return outputBuffer;
}

/**
 * Patch the theme XML to set dk1 (dark 1) → light text, lt1 (light 1) → dark bg
 * This is the most impactful single change — themes propagate to all slides.
 */
function patchThemeXml(xml: string): string {
  // dk1: typically the text colour in light themes — remap to near-white
  xml = xml.replace(
    /<a:dk1>\s*<a:sysClr[^>]*lastClr="[0-9A-Fa-f]{6}"[^>]*\/>\s*<\/a:dk1>/g,
    `<a:dk1><a:srgbClr val="${LIGHT_TEXT_HEX}"/></a:dk1>`
  );
  xml = xml.replace(
    /<a:dk1>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"[^/]*\/>\s*<\/a:dk1>/g,
    `<a:dk1><a:srgbClr val="${LIGHT_TEXT_HEX}"/></a:dk1>`
  );

  // lt1: typically the background colour — remap to near-black
  xml = xml.replace(
    /<a:lt1>\s*<a:sysClr[^>]*lastClr="[0-9A-Fa-f]{6}"[^>]*\/>\s*<\/a:lt1>/g,
    `<a:lt1><a:srgbClr val="${DARK_BG_HEX}"/></a:lt1>`
  );
  xml = xml.replace(
    /<a:lt1>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"[^/]*\/>\s*<\/a:lt1>/g,
    `<a:lt1><a:srgbClr val="${DARK_BG_HEX}"/></a:lt1>`
  );

  // accent1 → our purple
  xml = xml.replace(
    /<a:accent1>\s*<a:srgbClr val="[0-9A-Fa-f]{6}"[^/]*\/>\s*<\/a:accent1>/g,
    `<a:accent1><a:srgbClr val="${ACCENT_HEX}"/></a:accent1>`
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
function patchSlideXml(xml: string, isMaster: boolean): string {
  // 1. Slide/master/layout background (<p:bg>) → dark page colour
  xml = xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/g, (block) =>
    replaceSolidFillColors(block, true)
  );

  // 2. Remaining shape / line / picture fills → dark surface (colourful kept)
  xml = replaceSolidFillColors(xml, false);

  // 3. Gradient stops (white gradients otherwise survive as light blobs)
  xml = patchGradientFills(xml, false);

  // 4. Text colours — MUST run after the fill passes. Explicit white text
  //    gets darkened by step 2/3 while still inside <a:rPr>, so the text pass
  //    recognises both original near-black and our converted dark palette and
  //    remaps them to light text (otherwise white text would become invisible).
  xml = replaceTextColors(xml);

  // If it's a master slide, also patch the body text defaults
  if (isMaster) {
    xml = patchMasterDefaults(xml);
  }

  return xml;
}

/** Same as patchSlideXml, minus background/master defaults — for chart parts */
function patchChartXml(xml: string): string {
  xml = replaceSolidFillColors(xml, false);
  xml = patchGradientFills(xml, false);
  xml = replaceTextColors(xml);
  return xml;
}

/**
 * Map a single solid-fill hex to the dark palette, or null to keep it.
 *  - Near-white fill → dark background / surface
 *  - Near-black fill → dark surface (never leave it invisible on dark bg)
 *  - Colourful fills preserved unchanged
 */
function mapFillColor(hex: string, isBackground: boolean): string | null {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r + g + b) / 3;
  const saturation = getPerceivedSaturation(r, g, b);

  if (saturation < 25 && brightness > 180) {
    return isBackground ? DARK_BG_HEX : DARK_SURFACE_HEX;
  }
  if (saturation < 25 && brightness < 50) {
    return DARK_SURFACE_HEX;
  }
  return null;
}

/**
 * Replace solid fill colours that are near-white with our dark bg,
 * and near-black with our surface colour.
 */
function replaceSolidFillColors(xml: string, isBackground: boolean): string {
  // Match: <a:solidFill><a:srgbClr val="RRGGBB"/></a:solidFill>
  return xml.replace(
    /<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"(\s*\/>|>(?:<\/a:srgbClr>)?)\s*<\/a:solidFill>/g,
    (match, hex) => {
      const mapped = mapFillColor(hex, isBackground);
      if (!mapped) return match; // colourful / mid-tone: keep as-is
      return `<a:solidFill><a:srgbClr val="${mapped}"/></a:solidFill>`;
    }
  );
}

/**
 * Map gradient stops (<a:gs>) with the same fill rules, so white gradients
 * (common as subtle page/card shading) don't survive as light blobs.
 */
function patchGradientFills(xml: string, isBackground: boolean): string {
  return xml.replace(
    /<a:gs(?:\s[^>]*)?>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/g,
    (match, hex) => {
      const mapped = mapFillColor(hex, isBackground);
      if (!mapped) return match;
      return match.replace(hex, mapped);
    }
  );
}

/** Replace explicit text run colours */
function replaceTextColors(xml: string): string {
  // Match <a:rPr ...> that contains a solidFill with near-black colour
  // Simple approach: replace srgbClr inside <a:solidFill> within <a:rPr> context
  return xml.replace(
    /(<a:rPr[^>]*>(?:(?!<\/a:rPr>)[\s\S])*?<a:solidFill>\s*<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g,
    (match, prefix, hex, suffix) => {
      if (isTextDarkOnDark(hex)) {
        // Near-black text, or a dark-palette colour produced by the fill
        // pass (which also catches explicit white text that got darkened
        // first) → off-white
        return `${prefix}${LIGHT_TEXT_HEX}${suffix}`;
      }
      // White / colourful text is legible as-is — keep it
      return match;
    }
  );
}

/** True when a text-run colour would be unreadable on the dark background */
function isTextDarkOnDark(hex: string): boolean {
  if (hex.toUpperCase() === DARK_BG_HEX || hex.toUpperCase() === DARK_SURFACE_HEX) {
    return true;
  }
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r + g + b) / 3;
  const saturation = getPerceivedSaturation(r, g, b);
  return saturation < 25 && brightness < 80;
}

function patchMasterDefaults(xml: string): string {
  // Patch any defRPr (default run properties) colours
  return xml.replace(
    /(<a:defRPr[^>]*>(?:(?!<\/a:defRPr>)[\s\S])*?<a:solidFill>\s*<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g,
    (match, prefix, hex, suffix) => {
      if (isTextDarkOnDark(hex)) {
        return `${prefix}${LIGHT_TEXT_HEX}${suffix}`;
      }
      return match;
    }
  );
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
