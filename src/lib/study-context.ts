/**
 * Noctra Study AI 2.0 — Context Retrieval & Document Grounding
 *
 * Slices, ranks, and budgets study passages from one or more uploaded study materials
 * so that Gemini requests are firmly grounded in the student's actual materials
 * while remaining within model token and latency limits.
 */

import type { StudyMaterial, StudyPassage } from "./study-material-extractor";

export interface GroundedContext {
  formattedContext: string;
  sourceDocuments: string[];
  sourcePages: number[];
  totalCharacters: number;
  isSufficient: boolean;
  passagesCount: number;
}

export interface ContextFilterOptions {
  materialIds?: string[];
  subject?: string;
  chapter?: string;
  query?: string;
  maxCharacters?: number;
}

/** Extracts meaningful query keywords for ranking passages */
function extractKeywords(query: string): string[] {
  const stopWords = new Set([
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
    "by", "can", "did", "do", "does", "doing", "don", "down", "during", "each", "few", "for",
    "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself",
    "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just",
    "me", "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once",
    "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "s", "same", "she",
    "should", "so", "some", "such", "t", "than", "that", "the", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too",
    "under", "until", "up", "very", "was", "we", "were", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "teach", "explain", "give", "tell", "show"
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/** Scores a passage based on keyword occurrences and density */
function scorePassage(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 1;
  const lower = text.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    let index = 0;
    let count = 0;
    while ((index = lower.indexOf(kw, index)) !== -1) {
      count++;
      index += kw.length;
    }
    if (count > 0) {
      score += count * (kw.length > 5 ? 2 : 1);
    }
  }

  return score;
}

/**
 * Retrieves the best grounded context from the user's selected study materials
 * based on query keywords and token/char limits.
 */
export function buildGroundedContext(
  materials: StudyMaterial[],
  options: ContextFilterOptions = {}
): GroundedContext {
  const maxChars = options.maxCharacters ?? 24_000;
  const keywords = options.query ? extractKeywords(options.query) : [];

  // Filter materials if specific IDs are selected
  let activeMaterials = materials;
  if (options.materialIds && options.materialIds.length > 0) {
    const idSet = new Set(options.materialIds);
    activeMaterials = materials.filter((m) => idSet.has(m.id));
  }

  // Filter by subject / chapter if specified
  if (options.subject && options.subject !== "All Subjects") {
    activeMaterials = activeMaterials.filter((m) => m.subject === options.subject);
  }
  if (options.chapter && options.chapter !== "All Chapters") {
    activeMaterials = activeMaterials.filter((m) => m.chapter === options.chapter);
  }

  if (activeMaterials.length === 0) {
    return {
      formattedContext: "",
      sourceDocuments: [],
      sourcePages: [],
      totalCharacters: 0,
      isSufficient: false,
      passagesCount: 0,
    };
  }

  // Flatten passages from all active materials
  const allPassages: Array<StudyPassage & { materialName: string; score: number }> = [];

  for (const mat of activeMaterials) {
    for (const p of mat.passages) {
      const score = scorePassage(p.text, keywords);
      allPassages.push({
        ...p,
        materialName: mat.name,
        score,
      });
    }
  }

  // If a query was provided, prioritize passages with the highest keyword relevance
  if (keywords.length > 0) {
    allPassages.sort((a, b) => b.score - a.score);
  }

  // Select passages within the budget
  const selectedPassages: typeof allPassages = [];
  let currentChars = 0;
  const sourceDocsSet = new Set<string>();
  const sourcePagesSet = new Set<number>();

  for (const p of allPassages) {
    if (currentChars + p.text.length > maxChars && selectedPassages.length > 0) {
      continue; // Skip large chunks that exceed budget, but try to fit smaller ones
    }

    selectedPassages.push(p);
    currentChars += p.text.length;
    sourceDocsSet.add(p.materialName);
    sourcePagesSet.add(p.pageNumber);

    if (currentChars >= maxChars) break;
  }

  // If sorted by score, re-sort chronologically by document and page number for pedagogical flow
  selectedPassages.sort((a, b) => {
    if (a.materialName !== b.materialName) {
      return a.materialName.localeCompare(b.materialName);
    }
    return a.pageNumber - b.pageNumber;
  });

  // Format into clear, citation-rich prompt blocks
  const formattedBlocks = selectedPassages.map((p) => {
    const docLabel = p.materialName ? `Document: "${p.materialName}" | ` : "";
    const secLabel = p.section ? `[${p.section}] ` : `[Page ${p.pageNumber}] `;
    return `--- ${docLabel}${secLabel}---\n${p.text}`;
  });

  const formattedContext = formattedBlocks.join("\n\n");
  const isSufficient = formattedContext.trim().length > 100;

  return {
    formattedContext,
    sourceDocuments: Array.from(sourceDocsSet),
    sourcePages: Array.from(sourcePagesSet).sort((a, b) => a - b),
    totalCharacters: formattedContext.length,
    isSufficient,
    passagesCount: selectedPassages.length,
  };
}
