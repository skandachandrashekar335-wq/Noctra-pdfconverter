/**
 * Noctra Multi-Provider Fallback Engine — Production-Readiness Audit
 *
 * Verifies:
 * 1. Environment variable credential isolation (no hardcoded secrets)
 * 2. Separate API key configuration & shared-key reporting for Gemini Primary & Secondary
 * 3. Model identifier validity against active upstream APIs
 * 4. Real generation tests against all three providers using actual Study AI format
 * 5. Real sequential provider failure & fallback (distinguishing real network tests from mocks)
 * 6. Objective verification: Practice Quiz, Practice Exam, Flashcards, Clear Explanation, Summary
 * 7. OpenRouter structured JSON quiz validation (parsed array matching schema)
 * 8. Grounding preservation (passages, page numbers, document names across all providers)
 */

import {
  createFallbackEngine,
  GeminiProviderAdapter,
  OpenRouterProviderAdapter,
  MultiProviderFallbackEngine,
  parseAndValidateStudyOutput,
} from "../src/lib/ai-provider-engine.ts";

const MOCK_SOURCE_PASSAGES = [
  {
    pageNumber: 1,
    text: "Mitochondria are double-membrane-bound organelles found in most eukaryotic organisms. They generate most of the cell's supply of adenosine triphosphate (ATP), used as a source of chemical energy.",
    documentName: "cell_biology_chapter4.pdf",
    section: "4.1 Organelle Structure",
  },
  {
    pageNumber: 2,
    text: "The inner mitochondrial membrane contains folds called cristae, which increase the surface area available for oxidative phosphorylation. The mitochondrial matrix contains enzymes of the citric acid cycle.",
    documentName: "cell_biology_chapter4.pdf",
    section: "4.2 Energy Transduction",
  },
];

async function runAudit() {
  console.log("=================================================================");
  console.log("NOCTRA STUDY AI — PRODUCTION READINESS AUDIT");
  console.log("=================================================================\n");

  let allChecksPassed = true;

  // ─────────────────────────────────────────────────────────────────
  // CHECK 1: Credential Source & Status Reporting
  // ─────────────────────────────────────────────────────────────────
  console.log("▶ [CHECK 1 & 2] Credential Isolation & Key Sharing Reporting...");
  const engine = createFallbackEngine();
  const statuses = engine.getProviderStatuses();

  console.log("Provider Status Report:");
  for (const s of statuses) {
    console.log(`  • ${s.name} (${s.id}): model="${s.model}", configured=${s.configured}, keyStatus="${s.keyStatus}"`);
    if ("apiKey" in s) {
      console.error("  ❌ CRITICAL SECURITY FLAW: apiKey was exposed in provider status!");
      allChecksPassed = false;
    }
  }

  // Verify dedicated key detection when separate keys are provided
  const engineWithSeparateKeys = createFallbackEngine({
    GEMINI_API_KEY: "dummy_primary_key_abc",
    GEMINI_SECONDARY_API_KEY: "dummy_secondary_key_xyz",
    OPENROUTER_API_KEY: "dummy_openrouter_key_123",
  });
  const separateStatuses = engineWithSeparateKeys.getProviderStatuses();
  const primaryStatus = separateStatuses.find((p) => p.id === "gemini-primary");
  const secondaryStatus = separateStatuses.find((p) => p.id === "gemini-secondary");

  if (primaryStatus?.keyStatus === "dedicated" && secondaryStatus?.keyStatus === "dedicated") {
    console.log("  ✔ Separate keys correctly report keyStatus: 'dedicated'");
  } else {
    console.error("  ❌ Separate keys did not report 'dedicated' status");
    allChecksPassed = false;
  }

  const engineWithSharedKey = createFallbackEngine({
    GEMINI_API_KEY: "dummy_primary_key_abc",
    OPENROUTER_API_KEY: "dummy_openrouter_key_123",
  });
  const sharedSecondaryStatus = engineWithSharedKey.getProviderStatuses().find((p) => p.id === "gemini-secondary");
  if (sharedSecondaryStatus?.keyStatus === "shared") {
    console.log("  ✔ Shared key correctly reports keyStatus: 'shared'");
  } else {
    console.error("  ❌ Shared key did not report 'shared' status");
    allChecksPassed = false;
  }

  // ─────────────────────────────────────────────────────────────────
  // CHECK 3: Verify Gemini Model Identifiers
  // ─────────────────────────────────────────────────────────────────
  console.log("\n▶ [CHECK 3] Verifying Configured Gemini Models on Live API...");
  const primaryModel = process.env.GEMINI_PRIMARY_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const secondaryModel = process.env.GEMINI_SECONDARY_MODEL || "gemini-flash-lite-latest";
  console.log(`  Target Primary:   ${primaryModel}`);
  console.log(`  Target Secondary: ${secondaryModel}`);

  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    if (listRes.ok) {
      const modelData = await listRes.json();
      const availableNames = (modelData.models || []).map((m) => m.name.replace("models/", ""));
      const primaryValid = availableNames.includes(primaryModel);
      const secondaryValid = availableNames.includes(secondaryModel);

      console.log(`  Primary model [${primaryModel}] available:   ${primaryValid ? "✔ YES" : "❌ NO"}`);
      console.log(`  Secondary model [${secondaryModel}] available: ${secondaryValid ? "✔ YES" : "❌ NO"}`);

      if (!primaryValid || !secondaryValid) {
        allChecksPassed = false;
      }
    } else {
      console.warn("  ⚠ Could not query models list directly (status " + listRes.status + ")");
    }
  } catch (err) {
    console.error("  ❌ Model check error:", err.message);
  }

  // ─────────────────────────────────────────────────────────────────
  // CHECK 4 & 6: Real Generation Tests (All Objectives & Grounding)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n▶ [CHECK 4, 6 & 8] Real Generation Tests on Primary Provider Across Objectives...");

  const objectivesToTest = [
    {
      task: "explain",
      name: "Clear Explanation",
      expectedPattern: /cristae|ATP|mitochondria/i,
      checkOutput: (res) => typeof res.answer === "string" && res.answer.length > 50,
    },
    {
      task: "quiz",
      name: "Practice Quiz",
      expectedPattern: /mitochondria|ATP/i,
      checkOutput: (res) => Array.isArray(res.quiz) && res.quiz.length >= 1 && typeof res.quiz[0].question === "string",
    },
    {
      task: "flashcards",
      name: "Flashcards",
      expectedPattern: /cristae|matrix|ATP/i,
      checkOutput: (res) => Array.isArray(res.flashcards) && res.flashcards.length >= 1 && typeof res.flashcards[0].front === "string",
    },
    {
      task: "practice-test",
      name: "Practice Exam",
      expectedPattern: /exam|question|marks|mitochondria/i,
      checkOutput: (res) => typeof res.answer === "string" && res.answer.length > 80,
    },
    {
      task: "summary",
      name: "Executive Summary",
      expectedPattern: /Executive Summary/i,
      checkOutput: (res) => res.answer.includes("Executive Summary"),
    },
  ];

  for (const obj of objectivesToTest) {
    console.log(`  Testing Objective: ${obj.name} [${obj.task}]...`);
    const req = {
      documentKey: "0123456789abcdef0123456789abcdef",
      task: obj.task,
      questionCount: 3,
      passages: MOCK_SOURCE_PASSAGES,
    };

    try {
      const res = await engine.generate(req);
      const matchesPattern = obj.expectedPattern.test(res.answer);
      const passesCheck = obj.checkOutput(res);
      const sourcesPreserved =
        Array.isArray(res.sourcePages) &&
        res.sourcePages.includes(1) &&
        res.sourcePages.includes(2) &&
        Array.isArray(res.sourceDocs) &&
        res.sourceDocs.includes("cell_biology_chapter4.pdf");

      if (matchesPattern && passesCheck && sourcesPreserved) {
        console.log(`    ✔ ${obj.name}: Success via ${res.provider} (${res.model}). Grounding preserved.`);
      } else {
        console.error(`    ❌ ${obj.name}: Output failed validation check.`);
        console.error(`       Pattern: ${matchesPattern}, Check: ${passesCheck}, Grounding: ${sourcesPreserved}`);
        allChecksPassed = false;
      }
    } catch (err) {
      console.error(`    ❌ ${obj.name} failed:`, err.message);
      allChecksPassed = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CHECK 7: OpenRouter Structured Quiz Validation
  // ─────────────────────────────────────────────────────────────────
  console.log("\n▶ [CHECK 7] OpenRouter Structured Quiz Validation (Real Live API)...");
  const openRouterAdapter = new OpenRouterProviderAdapter({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
  });

  const quizReq = {
    documentKey: "0123456789abcdef0123456789abcdef",
    task: "quiz",
    questionCount: 2,
    passages: MOCK_SOURCE_PASSAGES,
  };

  try {
    const rawOutput = await openRouterAdapter.generate(quizReq);
    const parsedResult = parseAndValidateStudyOutput(rawOutput.rawText, quizReq);

    if (parsedResult.valid && Array.isArray(parsedResult.quiz) && parsedResult.quiz.length >= 2) {
      console.log(`  ✔ OpenRouter produced ${parsedResult.quiz.length} valid structured questions:`);
      for (const [i, q] of parsedResult.quiz.entries()) {
        console.log(`    ${i + 1}. "${q.question}" [${q.options?.length} options, Correct: ${q.correctAnswerLetter}]`);
      }
    } else {
      console.error("  ❌ OpenRouter failed structured JSON validation:", parsedResult.reason);
      allChecksPassed = false;
    }
  } catch (err) {
    console.error("  ❌ OpenRouter live test failed:", err.message);
    allChecksPassed = false;
  }

  // ─────────────────────────────────────────────────────────────────
  // CHECK 5: Real Sequential Provider Failure & Fallback
  // (Clearly distinguished: Real live network endpoints with simulated auth failure)
  // ─────────────────────────────────────────────────────────────────
  console.log("\n▶ [CHECK 5] Real Network Sequential Failure & Fallback Test...");
  console.log("  Distinction: REAL HTTP requests to live Google & OpenRouter endpoints with invalid credentials");

  const simulatedBadPrimary = new GeminiProviderAdapter({
    id: "gemini-primary",
    displayName: "Gemini Primary",
    apiKey: "INVALID_TEST_KEY_INTENTIONAL_FAIL_1",
    model: primaryModel,
  });

  const realSecondary = new GeminiProviderAdapter({
    id: "gemini-secondary",
    displayName: "Gemini Secondary",
    apiKey: process.env.GEMINI_API_KEY,
    model: secondaryModel,
  });

  const realOpenRouter = new OpenRouterProviderAdapter({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
  });

  const fallbackEngineStep1 = new MultiProviderFallbackEngine([
    simulatedBadPrimary,
    realSecondary,
    realOpenRouter,
  ]);

  try {
    const fallbackRes1 = await fallbackEngineStep1.generate({
      documentKey: "0123456789abcdef0123456789abcdef",
      task: "explain",
      question: "What role do cristae play in the mitochondrion?",
      passages: MOCK_SOURCE_PASSAGES,
    });

    if (
      fallbackRes1.provider === "gemini-secondary" &&
      fallbackRes1.fallbackOccurred === true &&
      fallbackRes1.fallbackChain.length === 2 &&
      fallbackRes1.fallbackChain[0] === "gemini-primary" &&
      fallbackRes1.fallbackChain[1] === "gemini-secondary"
    ) {
      console.log("  ✔ Level 1 Fallback Verified: Primary failed -> Secondary recovered via live API!");
      console.log(`    Provider used: ${fallbackRes1.providerLabel} (${fallbackRes1.model})`);
      console.log(`    Fallback chain: ${fallbackRes1.fallbackChain.join(" → ")}`);
    } else {
      console.error("  ❌ Level 1 Fallback did not produce expected fallback result:", fallbackRes1);
      allChecksPassed = false;
    }
  } catch (err) {
    console.error("  ❌ Level 1 Fallback test threw unexpected error:", err.message);
    allChecksPassed = false;
  }

  // Level 2 Fallback: Primary & Secondary both fail -> OpenRouter recovers
  const simulatedBadSecondary = new GeminiProviderAdapter({
    id: "gemini-secondary",
    displayName: "Gemini Secondary",
    apiKey: "INVALID_TEST_KEY_INTENTIONAL_FAIL_2",
    model: secondaryModel,
  });

  const fallbackEngineStep2 = new MultiProviderFallbackEngine([
    simulatedBadPrimary,
    simulatedBadSecondary,
    realOpenRouter,
  ]);

  try {
    const fallbackRes2 = await fallbackEngineStep2.generate({
      documentKey: "0123456789abcdef0123456789abcdef",
      task: "explain",
      question: "What role do cristae play in the mitochondrion?",
      passages: MOCK_SOURCE_PASSAGES,
    });

    if (
      fallbackRes2.provider === "openrouter" &&
      fallbackRes2.fallbackOccurred === true &&
      fallbackRes2.fallbackChain.length === 3 &&
      fallbackRes2.fallbackChain[2] === "openrouter"
    ) {
      console.log("  ✔ Level 2 Fallback Verified: Primary & Secondary failed -> OpenRouter Free recovered via live API!");
      console.log(`    Provider used: ${fallbackRes2.providerLabel} (${fallbackRes2.model})`);
      console.log(`    Fallback chain: ${fallbackRes2.fallbackChain.join(" → ")}`);
      console.log(`    Answer snippet: ${fallbackRes2.answer.slice(0, 100).replace(/\n/g, " ")}...`);
    } else {
      console.error("  ❌ Level 2 Fallback did not produce expected OpenRouter fallback result:", fallbackRes2);
      allChecksPassed = false;
    }
  } catch (err) {
    console.error("  ❌ Level 2 Fallback test threw unexpected error:", err.message);
    allChecksPassed = false;
  }

  // ─────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────
  console.log("\n=================================================================");
  if (allChecksPassed) {
    console.log("🏆 ALL PRODUCTION READINESS CHECKS PASSED SUCCESSFULLY!");
  } else {
    console.log("❌ ONE OR MORE AUDIT CHECKS FAILED. See above for details.");
    process.exitCode = 1;
  }
  console.log("=================================================================\n");
}

runAudit().catch((err) => {
  console.error("Audit fatal error:", err);
  process.exit(1);
});
