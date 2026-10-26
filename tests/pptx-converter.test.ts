import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { convertPptxToDarkMode } from "../src/lib/pptx-converter.ts";

// ─── Synthetic PPTX fixture (no real documents needed) ───────────────────────

const THEME_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Test">
  <a:themeElements>
    <a:clrScheme name="Office">
      <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
      <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="44546A"/></a:dk2>
      <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
      <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
    </a:clrScheme>
  </a:themeElements>
</a:theme>`;

const MASTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <p:txStyles>
        <p:titleStyle>
          <a:lvl1pPr><a:defRPr sz="4400">
            <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
          </a:defRPr></a:lvl1pPr>
        </p:titleStyle>
      </p:txStyles>
    </p:spTree>
  </p:cSld>
</p:sldMaster>`;

const LAYOUT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld name="Title Slide">
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        </p:spPr>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;

const SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg>
    <p:spTree>
      <!-- dark body text -->
      <p:sp><p:txBody><a:p><a:r>
        <a:rPr lang="en-US"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr>
        <a:t>Dark body text</a:t>
      </a:r></a:p></p:txBody></p:sp>
      <!-- explicit white text on a coloured shape -->
      <p:sp><p:txBody><a:p><a:r>
        <a:rPr lang="en-US" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr>
        <a:t>White label</a:t>
      </a:r></a:p></p:txBody></p:sp>
      <!-- colourful shape fill that must be preserved -->
      <p:sp><p:spPr>
        <a:solidFill><a:srgbClr val="4F8FFF"/></a:solidFill>
      </p:spPr></p:sp>
      <!-- white card fill -->
      <p:sp><p:spPr>
        <a:solidFill><a:srgbClr val="F7F7F9"/></a:solidFill>
      </p:spPr></p:sp>
      <!-- subtle white gradient -->
      <p:sp><p:spPr>
        <a:gradFill>
          <a:gsLst>
            <a:gs pos="0"><a:srgbClr val="FFFFFF"/></a:gs>
            <a:gs pos="100000"><a:srgbClr val="E0E0E0"/></a:gs>
          </a:gsLst>
        </a:gradFill>
      </p:spPr></p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

const CHART_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:plotArea>
    <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></c:spPr>
  </c:plotArea>
  <c:txPr><a:bodyPr/><a:p><a:r>
    <a:rPr lang="en-US"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr>
    <a:t>Sales</a:t>
  </a:r></a:p></c:txPr>
</c:chart>`;

const NOTES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r>
    <a:rPr lang="en-US"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr>
    <a:t>Speaker note</a:t>
  </a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>`;

async function buildFixturePptx(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`
  );
  zip.file("ppt/theme/theme1.xml", THEME_XML);
  zip.file("ppt/slideMasters/slideMaster1.xml", MASTER_XML);
  zip.file("ppt/slideLayouts/slideLayout1.xml", LAYOUT_XML);
  zip.file("ppt/slides/slide1.xml", SLIDE_XML);
  zip.file("ppt/charts/chart1.xml", CHART_XML);
  zip.file("ppt/notesSlides/notesSlide1.xml", NOTES_XML);
  // Binary media must pass through byte-for-byte
  zip.file("ppt/media/image1.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 250, 251]));
  return zip.generateAsync({ type: "arraybuffer" });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("convertPptxToDarkMode", () => {
  test("produces a loadable zip with the same file inventory", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);

    const zip = await JSZip.loadAsync(output);
    const names = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    assert.deepEqual(names, [
      "[Content_Types].xml",
      "ppt/charts/chart1.xml",
      "ppt/media/image1.png",
      "ppt/notesSlides/notesSlide1.xml",
      "ppt/presentation.xml",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slides/slide1.xml",
      "ppt/theme/theme1.xml",
    ]);
  });

  test("reports slide progress", async () => {
    const input = await buildFixturePptx();
    const seen: Array<[number, number]> = [];
    await convertPptxToDarkMode(input, (slide, total) => seen.push([slide, total]));
    assert.deepEqual(seen, [[1, 1]]);
  });

  test("theme: dk1 → light text, lt1 → dark background, accent1 preserved", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);
    const zip = await JSZip.loadAsync(output);
    const theme = await zip.file("ppt/theme/theme1.xml")!.async("string");

    assert.match(theme, /<a:dk1><a:srgbClr val="E6E6EB"\/><\/a:dk1>/);
    assert.match(theme, /<a:lt1><a:srgbClr val="12121A"\/><\/a:lt1>/);
    // accent1 is intentionally remapped to the Noctra brand purple
    assert.match(theme, /<a:accent1><a:srgbClr val="7C6DFF"\/><\/a:accent1>/);
    assert.ok(!/lastClr="FFFFFF"/.test(theme), "white window colour must be gone");
    assert.ok(!/lastClr="000000"/.test(theme), "black text colour must be gone");
  });

  test("slide: background darkens, dark text lightens, colour preserved", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);
    const zip = await JSZip.loadAsync(output);
    const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");

    // Background <p:bg> becomes dark page colour
    assert.match(slide, /<p:bg><p:bgPr><a:solidFill><a:srgbClr val="12121A"\/>/);

    // Dark body text → off-white
    assert.match(
      slide,
      /<a:rPr lang="en-US"><a:solidFill><a:srgbClr val="E6E6EB"\/><\/a:solidFill><\/a:rPr>/
    );

    // REGRESSION: explicit white text must NOT be darkened into invisibility
    assert.match(
      slide,
      /<a:rPr lang="en-US" b="1"><a:solidFill><a:srgbClr val="E6E6EB"\/><\/a:solidFill><\/a:rPr>/
    );

    // Colourful shape fill untouched
    assert.match(slide, /<a:srgbClr val="4F8FFF"\/>/);

    // White card fill → dark surface
    assert.match(slide, /<a:solidFill><a:srgbClr val="1C1C26"\/><\/a:solidFill>/);
    assert.ok(!/val="F7F7F9"/.test(slide), "white card fill must be transformed");

    // Gradient stops no longer white/light grey
    assert.ok(!/val="FFFFFF"\/><\/a:gs>/.test(slide));
    assert.ok(!/val="E0E0E0"/.test(slide));
    assert.match(slide, /<a:gs pos="0"><a:srgbClr val="1C1C26"\/><\/a:gs>/);
  });

  test("master and layout placeholders are transformed", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);
    const zip = await JSZip.loadAsync(output);

    const master = await zip.file("ppt/slideMasters/slideMaster1.xml")!.async("string");
    assert.match(master, /<a:solidFill><a:srgbClr val="12121A"\/><\/a:solidFill>/, "master background dark");
    assert.match(
      master,
      /<a:solidFill><a:srgbClr val="E6E6EB"\/><\/a:solidFill>\s*<\/a:defRPr>/,
      "master default text light"
    );

    const layout = await zip.file("ppt/slideLayouts/slideLayout1.xml")!.async("string");
    assert.ok(!/val="FFFFFF"/.test(layout), "layout white fill transformed");
    assert.match(layout, /<a:srgbClr val="1C1C26"\/>/);
  });

  test("charts: plot area and label text are transformed", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);
    const zip = await JSZip.loadAsync(output);
    const chart = await zip.file("ppt/charts/chart1.xml")!.async("string");

    assert.ok(!/val="FFFFFF"/.test(chart), "white plot area must be transformed");
    assert.match(chart, /<a:srgbClr val="1C1C26"\/>/);
    assert.match(
      chart,
      /<a:rPr lang="en-US"><a:solidFill><a:srgbClr val="E6E6EB"\/><\/a:solidFill><\/a:rPr>/
    );
  });

  test("speaker notes: black text lightens", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);
    const zip = await JSZip.loadAsync(output);
    const notes = await zip.file("ppt/notesSlides/notesSlide1.xml")!.async("string");

    assert.match(
      notes,
      /<a:rPr lang="en-US"><a:solidFill><a:srgbClr val="E6E6EB"\/><\/a:solidFill><\/a:rPr>/
    );
  });

  test("binary media is preserved byte-for-byte", async () => {
    const input = await buildFixturePptx();
    const output = await convertPptxToDarkMode(input);
    const zip = await JSZip.loadAsync(output);
    const media = await zip.file("ppt/media/image1.png")!.async("uint8array");
    assert.deepEqual(
      Array.from(media),
      [0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3, 250, 251]
    );
  });

  test("rejects a buffer that is not a zip archive", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    await assert.rejects(() => convertPptxToDarkMode(garbage));
  });

  test("rejects an empty input", async () => {
    await assert.rejects(() => convertPptxToDarkMode(new ArrayBuffer(0)));
  });

  test("rejects a ZIP that is not a PPTX package", async () => {
    const zip = new JSZip();
    zip.file("notes.txt", "not a presentation");
    const unrelatedZip = await zip.generateAsync({ type: "arraybuffer" });
    await assert.rejects(
      () => convertPptxToDarkMode(unrelatedZip),
      /valid PPTX package/
    );
  });

  test("rejects a PPTX package with no slides", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const noSlides = await zip.generateAsync({ type: "arraybuffer" });
    await assert.rejects(
      () => convertPptxToDarkMode(noSlides),
      /contains no slides/
    );
  });
});
