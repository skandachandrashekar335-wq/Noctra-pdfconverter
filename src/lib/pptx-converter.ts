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
  const zip = await JSZip.loadAsync(inputBuffer);

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
    /ppt\/slideLayouts\/slideLayout\d*\.xml$/.test(name)
  );
  for (const layoutFile of layoutFiles) {
    const xml = await layoutFile ? await zip.files[layoutFile].async("string") : "";
    if (xml) zip.file(layoutFile, patchSlideXml(xml, true));
  }

  // 4. Patch individual slides
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || "0");
      const nb = parseInt(b.match(/\d+/)?.[0] || "0");
      return na - nb;
    });

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
  // Background colour: <p:bg><p:bgPr> or <p:bgRef>
  // Replace any explicit solid white/light background fill
  xml = replaceSolidFillColors(xml, true);

  // Text colours — remap dark to light
  xml = replaceTextColors(xml);

  // If it's a master slide, also patch the body text defaults
  if (isMaster) {
    xml = patchMasterDefaults(xml);
  }

  return xml;
}

/**
 * Replace solid fill colours that are near-white with our dark bg,
 * and near-black with our surface colour.
 */
function replaceSolidFillColors(xml: string, isBackground: boolean): string {
  // Match: <a:solidFill><a:srgbClr val="RRGGBB"/></a:solidFill>
  return xml.replace(
    /<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"(\s*\/>|>(?:<\/a:srgbClr>)?)\s*<\/a:solidFill>/g,
    (_match, hex) => {
      const { r, g, b } = hexToRgb(hex);
      const brightness = (r + g + b) / 3;
      const saturation = getPerceivedSaturation(r, g, b);

      if (saturation < 25 && brightness > 180) {
        // Near-white fill → dark background
        return `<a:solidFill><a:srgbClr val="${isBackground ? DARK_BG_HEX : DARK_SURFACE_HEX}"/></a:solidFill>`;
      } else if (saturation < 25 && brightness < 50) {
        // Near-black fill → dark surface (avoid invisible text on dark bg)
        return `<a:solidFill><a:srgbClr val="${DARK_SURFACE_HEX}"/></a:solidFill>`;
      }
      // Keep colourful fills unchanged
      return _match;
    }
  );
}

/** Replace explicit text run colours */
function replaceTextColors(xml: string): string {
  // Match <a:rPr ...> that contains a solidFill with near-black colour
  // Simple approach: replace srgbClr inside <a:solidFill> within <a:rPr> context
  return xml.replace(
    /(<a:rPr[^>]*>(?:(?!<\/a:rPr>)[\s\S])*?<a:solidFill>\s*<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix) => {
      const { r, g, b } = hexToRgb(hex);
      const brightness = (r + g + b) / 3;
      const saturation = getPerceivedSaturation(r, g, b);

      if (saturation < 25 && brightness < 80) {
        // Near-black text → off-white
        return `${prefix}${LIGHT_TEXT_HEX}${suffix}`;
      }
      if (saturation < 25 && brightness > 200) {
        // White text on a dark slide is fine — keep it
        return _match;
      }
      return _match;
    }
  );
}

function patchMasterDefaults(xml: string): string {
  // Patch any defRPr (default run properties) colours
  return xml.replace(
    /(<a:defRPr[^>]*>(?:(?!<\/a:defRPr>)[\s\S])*?<a:solidFill>\s*<a:srgbClr val=")([0-9A-Fa-f]{6})(")/g,
    (_match, prefix, hex, suffix) => {
      const { r, g, b } = hexToRgb(hex);
      const brightness = (r + g + b) / 3;
      const saturation = getPerceivedSaturation(r, g, b);
      if (saturation < 25 && brightness < 80) {
        return `${prefix}${LIGHT_TEXT_HEX}${suffix}`;
      }
      return _match;
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
