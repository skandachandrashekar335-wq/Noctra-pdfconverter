/**
 * Noctra Study AI 2.0 — Study Material Text Extraction Engine
 *
 * Extracts text from PDF, DOCX, PPTX, and TXT files purely on the client-side
 * or in node environments without uploading documents to external servers.
 *
 * Preserves user privacy: original files remain strictly local in memory/storage.
 */

import JSZip from "jszip";

export type StudyFileType = "pdf" | "docx" | "pptx" | "txt";

export interface StudyPassage {
  pageNumber: number;
  text: string;
  section?: string;
  documentId?: string;
  documentName?: string;
}

export interface StudyMaterial {
  id: string;
  name: string;
  size: number;
  type: StudyFileType;
  pageCount: number;
  passages: StudyPassage[];
  totalChars: number;
  subject: string;
  chapter: string;
  isScanned: boolean;
  uploadedAt: number;
  previewSnippet: string;
}

export interface ExtractionProgress {
  stage: "reading" | "extracting" | "indexing" | "complete" | "error";
  current: number;
  total: number;
  percent: number;
  message: string;
}

/** Detects the supported file type from extension and/or mime type */
export function detectStudyFileType(fileName: string, mimeType?: string): StudyFileType | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".docx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    lower.endsWith(".pptx") ||
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "pptx";
  }
  if (lower.endsWith(".txt") || lower.endsWith(".md") || mimeType?.startsWith("text/")) {
    return "txt";
  }
  return null;
}

/** Computes a lightweight deterministic hash for deduplication */
export function generateMaterialId(name: string, size: number, firstBytesSample: string): string {
  let hash = 0;
  const str = `${name}:${size}:${firstBytesSample}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return `mat-${Math.abs(hash).toString(16)}-${size.toString(16)}`;
}

/** Extracts text from a plain text file */
export function extractTextFromTxt(
  text: string,
  fileName: string,
  docId: string
): { passages: StudyPassage[]; pageCount: number; isScanned: boolean } {
  const cleaned = text.trim();
  if (!cleaned) {
    return { passages: [], pageCount: 0, isScanned: false };
  }

  // Chunk by paragraphs into logical pages (~2000 chars per page)
  const paragraphs = cleaned.split(/\n\s*\n/);
  const passages: StudyPassage[] = [];
  let currentPage = 1;
  let currentBuffer: string[] = [];
  let currentLen = 0;

  for (const para of paragraphs) {
    const pTrim = para.trim();
    if (!pTrim) continue;

    if (currentLen + pTrim.length > 2200 && currentBuffer.length > 0) {
      passages.push({
        pageNumber: currentPage,
        text: currentBuffer.join("\n\n"),
        documentId: docId,
        documentName: fileName,
      });
      currentPage++;
      currentBuffer = [pTrim];
      currentLen = pTrim.length;
    } else {
      currentBuffer.push(pTrim);
      currentLen += pTrim.length;
    }
  }

  if (currentBuffer.length > 0) {
    passages.push({
      pageNumber: currentPage,
      text: currentBuffer.join("\n\n"),
      documentId: docId,
      documentName: fileName,
    });
  }

  return {
    passages,
    pageCount: passages.length,
    isScanned: false,
  };
}

/** Extracts text from DOCX (Office Open XML ZIP) */
export async function extractTextFromDocx(
  buffer: ArrayBuffer,
  fileName: string,
  docId: string
): Promise<{ passages: StudyPassage[]; pageCount: number; isScanned: boolean }> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Invalid DOCX file: missing word/document.xml");
  }

  const xml = await docFile.async("string");
  // Extract text from <w:p> paragraphs and <w:t> elements
  const paragraphRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gi;
  const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi;

  const paragraphs: string[] = [];
  let pMatch: RegExpExecArray | null;

  while ((pMatch = paragraphRegex.exec(xml)) !== null) {
    const pContent = pMatch[1];
    let pText = "";
    let tMatch: RegExpExecArray | null;
    while ((tMatch = textRegex.exec(pContent)) !== null) {
      pText += tMatch[1];
    }
    const trimmed = pText.trim();
    if (trimmed) {
      paragraphs.push(trimmed);
    }
  }

  // Chunk paragraphs into logical pages of ~2000 characters
  const passages: StudyPassage[] = [];
  let currentPage = 1;
  let currentBuffer: string[] = [];
  let currentLen = 0;

  for (const para of paragraphs) {
    if (currentLen + para.length > 2200 && currentBuffer.length > 0) {
      passages.push({
        pageNumber: currentPage,
        text: currentBuffer.join("\n\n"),
        documentId: docId,
        documentName: fileName,
      });
      currentPage++;
      currentBuffer = [para];
      currentLen = para.length;
    } else {
      currentBuffer.push(para);
      currentLen += para.length;
    }
  }

  if (currentBuffer.length > 0) {
    passages.push({
      pageNumber: currentPage,
      text: currentBuffer.join("\n\n"),
      documentId: docId,
      documentName: fileName,
    });
  }

  return {
    passages,
    pageCount: passages.length || 1,
    isScanned: false,
  };
}

/** Extracts text from PPTX (presentation slide files) */
export async function extractTextFromPptx(
  buffer: ArrayBuffer,
  fileName: string,
  docId: string
): Promise<{ passages: StudyPassage[]; pageCount: number; isScanned: boolean }> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return numA - numB;
    });

  if (slideFiles.length === 0) {
    throw new Error("Invalid PPTX file: no presentation slides found");
  }

  const passages: StudyPassage[] = [];
  const textRegex = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/gi;

  for (let i = 0; i < slideFiles.length; i++) {
    const slideName = slideFiles[i];
    const file = zip.file(slideName);
    if (!file) continue;

    const xml = await file.async("string");
    const texts: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(xml)) !== null) {
      const t = match[1].trim();
      if (t) texts.push(t);
    }

    const slideText = texts.join(" ");
    if (slideText.length > 0) {
      passages.push({
        pageNumber: i + 1,
        text: slideText,
        section: `Slide ${i + 1}`,
        documentId: docId,
        documentName: fileName,
      });
    }
  }

  return {
    passages,
    pageCount: slideFiles.length,
    isScanned: passages.length === 0,
  };
}

/** Extracts text from PDF via PDF.js */
export async function extractTextFromPdf(
  buffer: ArrayBuffer,
  fileName: string,
  docId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ passages: StudyPassage[]; pageCount: number; isScanned: boolean }> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined" && pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }

  // Load document using uint8 copy
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const passages: StudyPassage[] = [];
  let totalCharacters = 0;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    const strings: string[] = [];

    for (const item of content.items) {
      if ("str" in item && typeof item.str === "string") {
        strings.push(item.str);
      }
    }

    const pageText = strings.join(" ").replace(/\s+/g, " ").trim();
    if (pageText.length > 0) {
      totalCharacters += pageText.length;
      passages.push({
        pageNumber: pageNum,
        text: pageText,
        section: `Page ${pageNum}`,
        documentId: docId,
        documentName: fileName,
      });
    }

    if (onProgress) {
      onProgress(pageNum, numPages);
    }
  }

  // If a multi-page PDF yielded less than 50 characters, it is very likely scanned/image-based
  const isScanned = numPages > 0 && totalCharacters < 50;

  return {
    passages,
    pageCount: numPages,
    isScanned,
  };
}

/** Main extraction orchestrator that extracts any supported file */
export async function extractStudyMaterial(
  file: { name: string; size: number; type?: string; arrayBuffer: () => Promise<ArrayBuffer>; text?: () => Promise<string> },
  options: {
    subject?: string;
    chapter?: string;
    onProgress?: (progress: ExtractionProgress) => void;
  } = {}
): Promise<StudyMaterial> {
  const fileType = detectStudyFileType(file.name, file.type);
  if (!fileType) {
    throw new Error(
      `Unsupported file type for "${file.name}". Noctra Study AI supports PDF, DOCX, PPTX, and TXT files.`
    );
  }

  if (file.size > 50 * 1024 * 1024) {
    throw new Error(`"${file.name}" exceeds the 50MB file size limit.`);
  }

  options.onProgress?.({
    stage: "reading",
    current: 0,
    total: 100,
    percent: 10,
    message: `Reading ${file.name}...`,
  });

  const buffer = await file.arrayBuffer();
  const sampleBytes = new Uint8Array(buffer.slice(0, 32)).join("");
  const id = generateMaterialId(file.name, file.size, sampleBytes);

  options.onProgress?.({
    stage: "extracting",
    current: 30,
    total: 100,
    percent: 30,
    message: `Extracting text from ${file.name}...`,
  });

  let extractionResult: { passages: StudyPassage[]; pageCount: number; isScanned: boolean };

  switch (fileType) {
    case "txt": {
      const text = typeof file.text === "function" ? await file.text() : new TextDecoder().decode(buffer);
      extractionResult = extractTextFromTxt(text, file.name, id);
      break;
    }
    case "docx":
      extractionResult = await extractTextFromDocx(buffer, file.name, id);
      break;
    case "pptx":
      extractionResult = await extractTextFromPptx(buffer, file.name, id);
      break;
    case "pdf":
      extractionResult = await extractTextFromPdf(buffer, file.name, id, (cur, tot) => {
        const pct = Math.floor(30 + (cur / tot) * 50);
        options.onProgress?.({
          stage: "extracting",
          current: cur,
          total: tot,
          percent: pct,
          message: `Extracting page ${cur} of ${tot}...`,
        });
      });
      break;
  }

  options.onProgress?.({
    stage: "indexing",
    current: 90,
    total: 100,
    percent: 90,
    message: "Indexing study passages...",
  });

  const totalChars = extractionResult.passages.reduce((sum, p) => sum + p.text.length, 0);
  const firstPassage = extractionResult.passages[0]?.text || "";
  const previewSnippet = firstPassage.slice(0, 200).replace(/\s+/g, " ") + (firstPassage.length > 200 ? "..." : "");

  options.onProgress?.({
    stage: "complete",
    current: 100,
    total: 100,
    percent: 100,
    message: "Extraction complete!",
  });

  return {
    id,
    name: file.name,
    size: file.size,
    type: fileType,
    pageCount: extractionResult.pageCount,
    passages: extractionResult.passages,
    totalChars,
    subject: options.subject?.trim() || "General Study",
    chapter: options.chapter?.trim() || "All Chapters",
    isScanned: extractionResult.isScanned,
    uploadedAt: Date.now(),
    previewSnippet,
  };
}
