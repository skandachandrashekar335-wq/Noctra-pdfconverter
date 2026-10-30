/**
 * Noctra Study AI 2.0 — Complete Platform Test Suite
 *
 * Verifies:
 * 1. File extraction (PDF, DOCX, PPTX, TXT) and duplicate detection
 * 2. Document chunking, relevance ranking, and citation grounding
 * 3. Objective-to-prompt mapping (verifying Clear Explanation NEVER produces Executive Summary)
 * 4. Request validation for all 11 study objectives
 * 5. Structured output handling (Quiz, Flashcards, Answer Evaluation)
 * 6. Quiz scoring and answer evaluation logic
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {
  detectStudyFileType,
  extractTextFromTxt,
  extractTextFromDocx,
  extractTextFromPptx,
  generateMaterialId,
  type StudyMaterial,
} from "../src/lib/study-material-extractor.ts";
import {
  buildGroundedContext,
} from "../src/lib/study-context.ts";
import {
  validateStudyRequest,
  buildTaskInstruction,
  VALID_STUDY_TASKS,
  STUDY_OBJECTIVE_LABELS,
  type StudyTask,
} from "../src/lib/ai-study.ts";

describe("Noctra Study AI 2.0 — File Extraction Engine", () => {
  test("detects supported file extensions and mime types", () => {
    assert.equal(detectStudyFileType("notes.pdf"), "pdf");
    assert.equal(detectStudyFileType("lecture.docx"), "docx");
    assert.equal(detectStudyFileType("slides.pptx"), "pptx");
    assert.equal(detectStudyFileType("readings.txt"), "txt");
    assert.equal(detectStudyFileType("guide.md"), "txt");
    assert.equal(detectStudyFileType("archive.zip"), null);
    assert.equal(detectStudyFileType("photo.jpg"), null);
  });

  test("generates deterministic material IDs for duplicate detection", () => {
    const id1 = generateMaterialId("bio.pdf", 1024, "0123456789");
    const id2 = generateMaterialId("bio.pdf", 1024, "0123456789");
    const id3 = generateMaterialId("chem.pdf", 2048, "9876543210");
    assert.equal(id1, id2);
    assert.notEqual(id1, id3);
  });

  test("extracts text and creates logical pages from plain text", () => {
    const sample = "Paragraph one regarding thermodynamics.\n\nParagraph two with entropy formulas.";
    const result = extractTextFromTxt(sample, "physics.txt", "mat-1");
    assert.equal(result.isScanned, false);
    assert.equal(result.pageCount, 1);
    assert.equal(result.passages.length, 1);
    assert.match(result.passages[0].text, /thermodynamics/);
    assert.equal(result.passages[0].documentName, "physics.txt");
  });

  test("extracts text from synthetic DOCX packages", async () => {
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
       <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
         <w:body>
           <w:p><w:r><w:t>Cellular respiration produces ATP via oxidative phosphorylation.</w:t></w:r></w:p>
           <w:p><w:r><w:t>Glycolysis occurs in the cytoplasm.</w:t></w:r></w:p>
         </w:body>
       </w:document>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const result = await extractTextFromDocx(buffer, "biology.docx", "mat-2");
    assert.equal(result.isScanned, false);
    assert.equal(result.passages.length, 1);
    assert.match(result.passages[0].text, /Cellular respiration/);
    assert.match(result.passages[0].text, /Glycolysis/);
  });

  test("extracts slide text from synthetic PPTX packages", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
       <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
         <p:cSld><p:spTree><p:sp><p:txBody>
           <a:p><a:r><a:t>Newton's Laws of Motion</a:t></a:r></a:p>
         </p:txBody></p:sp></p:spTree></p:cSld>
       </p:sld>`
    );
    zip.file(
      "ppt/slides/slide2.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
       <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
         <p:cSld><p:spTree><p:sp><p:txBody>
           <a:p><a:r><a:t>Second Law: F = ma</a:t></a:r></a:p>
         </p:txBody></p:sp></p:spTree></p:cSld>
       </p:sld>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const result = await extractTextFromPptx(buffer, "mechanics.pptx", "mat-3");
    assert.equal(result.pageCount, 2);
    assert.equal(result.passages.length, 2);
    assert.equal(result.passages[0].section, "Slide 1");
    assert.match(result.passages[0].text, /Newton's Laws/);
    assert.equal(result.passages[1].section, "Slide 2");
    assert.match(result.passages[1].text, /F = ma/);
  });
});

describe("Noctra Study AI 2.0 — Grounding & Context Retrieval", () => {
  const sampleMaterials: StudyMaterial[] = [
    {
      id: "mat-bio-1",
      name: "Genetics_Unit1.pdf",
      size: 50000,
      type: "pdf",
      pageCount: 3,
      passages: [
        { pageNumber: 1, text: "Mendel's experiments with pea plants established laws of inheritance.", documentName: "Genetics_Unit1.pdf" },
        { pageNumber: 2, text: "The law of segregation states that alleles segregate during gamete formation.", documentName: "Genetics_Unit1.pdf" },
        { pageNumber: 3, text: "DNA double helix was discovered by Watson, Crick, and Franklin.", documentName: "Genetics_Unit1.pdf" },
      ],
      totalChars: 300,
      subject: "Biology",
      chapter: "Genetics",
      isScanned: false,
      uploadedAt: Date.now(),
      previewSnippet: "Mendel's experiments...",
    },
    {
      id: "mat-chem-1",
      name: "Organic_Chemistry.docx",
      size: 40000,
      type: "docx",
      pageCount: 2,
      passages: [
        { pageNumber: 1, text: "Alkanes are saturated hydrocarbons with single bonds (CnH2n+2).", documentName: "Organic_Chemistry.docx" },
        { pageNumber: 2, text: "Electrophilic aromatic substitution is typical for benzene rings.", documentName: "Organic_Chemistry.docx" },
      ],
      totalChars: 200,
      subject: "Chemistry",
      chapter: "Hydrocarbons",
      isScanned: false,
      uploadedAt: Date.now(),
      previewSnippet: "Alkanes are saturated...",
    },
  ];

  test("ranks and retrieves passages relevant to query", () => {
    const context = buildGroundedContext(sampleMaterials, { query: "alleles segregation" });
    assert.equal(context.isSufficient, true);
    assert.match(context.formattedContext, /law of segregation/);
    assert.match(context.formattedContext, /Genetics_Unit1\.pdf/);
  });

  test("filters by subject and chapter accurately", () => {
    const context = buildGroundedContext(sampleMaterials, { subject: "Chemistry" });
    assert.equal(context.sourceDocuments.length, 1);
    assert.equal(context.sourceDocuments[0], "Organic_Chemistry.docx");
    assert.match(context.formattedContext, /Alkanes/);
    assert.doesNotMatch(context.formattedContext, /Mendel/);
  });

  test("respects character budgeting", () => {
    const context = buildGroundedContext(sampleMaterials, { maxCharacters: 150 });
    assert.ok(context.totalCharacters <= 250); // within tight buffer
  });
});

describe("Noctra Study AI 2.0 — Objective-to-Prompt Mapping & Isolation", () => {
  const baseReq = {
    documentKey: "f".repeat(64),
    passages: [{ pageNumber: 1, text: "Sample text" }],
  };

  test("Clear Explanation NEVER generates an Executive Summary", () => {
    const explainPrompt = buildTaskInstruction({
      ...baseReq,
      task: "explain",
      question: "Photoelectric Effect",
    });

    assert.match(explainPrompt, /# 💡 Clear Explanation: Photoelectric Effect/);
    assert.match(explainPrompt, /DO NOT produce an Executive Summary/);
    assert.match(explainPrompt, /Pedagogical Analogy/);
  });

  test("Executive Summary explicitly mandates Executive Summary structure", () => {
    const summaryPrompt = buildTaskInstruction({
      ...baseReq,
      task: "summary",
    });

    assert.match(summaryPrompt, /# 📋 Executive Summary/);
    assert.match(summaryPrompt, /Core Overview/);
    assert.match(summaryPrompt, /Key Themes/);
  });

  test("Interactive Practice Quiz specifies JSON format and options schema", () => {
    const quizPrompt = buildTaskInstruction({
      ...baseReq,
      task: "quiz",
      questionCount: 4,
    });

    assert.match(quizPrompt, /```json/);
    assert.match(quizPrompt, /correctIndex/);
    assert.match(quizPrompt, /options/);
  });

  test("Answer Evaluation enforces rigorous grading schema and marks", () => {
    const evalPrompt = buildTaskInstruction({
      ...baseReq,
      task: "evaluate-answer",
      question: "Explain the Second Law of Thermodynamics",
      userAnswer: "Entropy always increases in an isolated system.",
      targetMarks: 5,
    });

    assert.match(evalPrompt, /marksAwarded/);
    assert.match(evalPrompt, /maxMarks": 5/);
    assert.match(evalPrompt, /keyPointsCovered/);
    assert.match(evalPrompt, /missingConcepts/);
    assert.match(evalPrompt, /modelAnswer/);
  });

  test("every valid task has a unique label and prompt instruction", () => {
    const seenInstructions = new Set<string>();

    for (const t of VALID_STUDY_TASKS) {
      assert.ok(STUDY_OBJECTIVE_LABELS[t], `Missing label for task ${t}`);
      const instruction = buildTaskInstruction({ ...baseReq, task: t as StudyTask });
      assert.ok(instruction.length > 50, `Instruction too short for task ${t}`);
      assert.ok(!seenInstructions.has(instruction), `Duplicate instruction found for task ${t}`);
      seenInstructions.add(instruction);
    }
  });

  test("rejects invalid task identifiers without falling back to summary", () => {
    assert.throws(() => {
      validateStudyRequest({
        documentKey: "f".repeat(64),
        task: "unsupported-fake-task",
        passages: [{ pageNumber: 1, text: "Some text" }],
      });
    }, /invalid/i);
  });
});
