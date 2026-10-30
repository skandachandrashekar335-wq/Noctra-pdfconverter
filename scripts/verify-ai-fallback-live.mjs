/**
 * Live End-to-End Fallback Engine Verification Script
 */

import { createFallbackEngine, GeminiProviderAdapter, OpenRouterProviderAdapter, MultiProviderFallbackEngine } from "../src/lib/ai-provider-engine.ts";

async function main() {
  console.log("=== Noctra AI Fallback Engine Live Verification ===\n");

  const sampleRequest = {
    documentKey: "0123456789abcdef0123456789abcdef",
    task: "summary",
    passages: [
      {
        pageNumber: 1,
        text: "Mitochondria are double-membrane-bound organelles found in most eukaryotic organisms. They generate most of the cell's supply of adenosine triphosphate (ATP), used as a source of chemical energy.",
        documentName: "cellular_biology.pdf",
      },
    ],
  };

  // Test 1: Full fallback engine with current environment
  console.log("1. Testing createFallbackEngine with environment configuration...");
  const engine = createFallbackEngine();
  console.log("Provider statuses:", engine.getProviderStatuses());

  try {
    const res = await engine.generate(sampleRequest);
    console.log("✓ Success with provider:", res.provider, `(${res.providerLabel})`);
    console.log("  Model used:", res.model);
    console.log("  Fallback occurred:", res.fallbackOccurred);
    console.log("  Fallback chain:", res.fallbackChain);
    console.log("  Answer snippet:", res.answer.slice(0, 120).replace(/\n/g, " "), "...\n");
  } catch (err) {
    console.error("✗ Engine failed:", err.message);
  }

  // Test 2: Simulated Primary failure -> Secondary fallback
  console.log("2. Simulating Gemini Primary failure (forcing fallback to Gemini Secondary)...");
  const brokenPrimary = new GeminiProviderAdapter({
    id: "gemini-primary",
    displayName: "Gemini Primary",
    apiKey: "INVALID_KEY_FOR_TESTING_FALLBACK",
    model: "gemini-3.5-flash",
  });
  const workingSecondary = new GeminiProviderAdapter({
    id: "gemini-secondary",
    displayName: "Gemini Secondary",
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_SECONDARY_MODEL || "gemini-flash-lite-latest",
  });
  const workingOpenRouter = new OpenRouterProviderAdapter({
    apiKey: process.env.OPENROUTER_API_KEY,
    model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
  });

  const secondaryEngine = new MultiProviderFallbackEngine([brokenPrimary, workingSecondary, workingOpenRouter]);
  try {
    const res2 = await secondaryEngine.generate(sampleRequest);
    console.log("✓ Success after fallback! Provider:", res2.provider, `(${res2.providerLabel})`);
    console.log("  Model used:", res2.model);
    console.log("  Fallback occurred:", res2.fallbackOccurred);
    console.log("  Fallback chain:", res2.fallbackChain, "\n");
  } catch (err) {
    console.error("✗ Secondary fallback failed:", err.message);
  }

  // Test 3: Simulated Gemini Primary & Secondary failure -> OpenRouter fallback
  console.log("3. Simulating both Gemini providers failing (forcing fallback to OpenRouter Free)...");
  const brokenSecondary = new GeminiProviderAdapter({
    id: "gemini-secondary",
    displayName: "Gemini Secondary",
    apiKey: "INVALID_KEY_FOR_TESTING_FALLBACK_2",
    model: "gemini-flash-lite-latest",
  });

  const openRouterEngine = new MultiProviderFallbackEngine([brokenPrimary, brokenSecondary, workingOpenRouter]);
  try {
    const res3 = await openRouterEngine.generate(sampleRequest);
    console.log("✓ Success after 2nd fallback! Provider:", res3.provider, `(${res3.providerLabel})`);
    console.log("  Model used:", res3.model);
    console.log("  Fallback occurred:", res3.fallbackOccurred);
    console.log("  Fallback chain:", res3.fallbackChain);
    console.log("  Answer snippet:", res3.answer.slice(0, 120).replace(/\n/g, " "), "...\n");
  } catch (err) {
    console.error("✗ OpenRouter fallback failed:", err.message);
  }

  console.log("=== All Fallback Verifications Complete ===");
}

main().catch(console.error);
