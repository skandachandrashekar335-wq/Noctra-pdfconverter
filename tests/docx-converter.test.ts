import { test, describe } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { convertDocxToDarkMode, patchThemeXml, patchWordXml } from "../src/lib/docx-converter.ts";

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:background w:color="FFFFFF"/>
  <w:body>
    <w:p><w:r><w:rPr><w:color w:val="000000"/></w:rPr><w:t>Editable text</w:t></w:r></w:p>
    <w:pPr><w:shd w:fill="F7F7F9"/></w:pPr>
    <w:p><w:r><w:rPr><w:color w:val="4F8FFF"/></w:rPr><w:t>Accent</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:color="000000"/></w:tblBorders></w:tblPr></w:tbl>
  </w:body>
</w:document>`;

const CONTENT_TYPES = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`;

async function fixture(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("word/document.xml", DOCUMENT_XML);
  zip.file(
    "word/theme/theme1.xml",
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:clrScheme><a:dk1><a:sysClr lastClr="000000"/></a:dk1><a:lt1><a:sysClr lastClr="FFFFFF"/></a:lt1></a:clrScheme></a:theme>`
  );
  // Media must be copied without being decoded or recoloured.
  zip.file("word/media/image1.png", new Uint8Array([137, 80, 78, 71, 1, 2, 3]));
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("DOCX structural dark-mode conversion", () => {
  test("patches editable XML while preserving media and package inventory", async () => {
    const output = await convertDocxToDarkMode(await fixture());
    const zip = await JSZip.loadAsync(output);
    const document = await zip.file("word/document.xml")!.async("string");
    const media = await zip.file("word/media/image1.png")!.async("uint8array");

    assert.match(document, /w:color w:val="E6E6EB"/);
    assert.match(document, /w:shd w:fill="1C1C26"/);
    assert.match(document, /w:color w:val="4F8FFF"/);
    assert.match(document, /w:background w:color="12121A"/);
    assert.deepEqual(Array.from(media), [137, 80, 78, 71, 1, 2, 3]);
    assert.match(document, /<w:t>Editable text<\/w:t>/);
  });

  test("patches theme inheritance without changing accent colours", () => {
    const xml = `<a:theme xmlns:a="x"><a:clrScheme><a:dk1><a:sysClr lastClr="000000"/></a:dk1><a:lt1><a:sysClr lastClr="FFFFFF"/></a:lt1><a:accent1><a:srgbClr val="4F8FFF"/></a:accent1></a:clrScheme></a:theme>`;
    const output = patchThemeXml(xml);
    assert.match(output, /<a:dk1><a:srgbClr val="E6E6EB"\/><\/a:dk1>/);
    assert.match(output, /<a:lt1><a:srgbClr val="12121A"\/><\/a:lt1>/);
    assert.match(output, /val="4F8FFF"/);
  });

  test("rejects malformed or non-DOCX packages", async () => {
    await assert.rejects(() => convertDocxToDarkMode(new Uint8Array([1, 2, 3]).buffer));
    const zip = new JSZip();
    zip.file("[Content_Types].xml", CONTENT_TYPES);
    const nonDocx = await zip.generateAsync({ type: "arraybuffer" });
    await assert.rejects(() => convertDocxToDarkMode(nonDocx));
  });

  test("pure XML helper is conservative for colourful content", () => {
    const output = patchWordXml(DOCUMENT_XML);
    assert.match(output, /4F8FFF/);
    assert.ok(!output.includes("FFFFFF"));
  });
});
