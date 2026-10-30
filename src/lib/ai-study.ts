/**
 * Optional, server-only study-assistant provider boundary.
 *
 * No provider is enabled by default. When an operator explicitly configures
 * an OpenAI-compatible endpoint, the caller must also send consent=true before
 * document text leaves the browser.
 */
export type StudyTask =
  | "summary"
  | "key-points"
  | "flashcards"
  | "quiz"
  | "explain"
  | "practice-test"
  | "revision-plan"
  | "weak-topics";

export interface StudyPassage {
  pageNumber: number;
  text: string;
}

export interface StudyRequest {
  documentKey: string;
  task: StudyTask;
  question?: string;
  passages: StudyPassage[];
}

export interface StudyResult {
  answer: string;
  sourcePages: number[];
}

export class StudyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudyInputError";
  }
}

export class StudyProviderUnavailableError extends Error {
  constructor(message = "No study-assistant provider is configured.") {
    super(message);
    this.name = "StudyProviderUnavailableError";
  }
}

export class StudyProviderError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 502, code = "study/provider-error") {
    super(message);
    this.name = "StudyProviderError";
    this.status = status;
    this.code = code;
  }
}

export class StudyProviderRateLimitError extends StudyProviderError {
  constructor(message = "Gemini API rate limit exceeded. Please wait a moment before trying again.") {
    super(message, 429, "study/rate-limited");
    this.name = "StudyProviderRateLimitError";
  }
}

export class StudyProviderAuthError extends StudyProviderError {
  constructor(message = "The Gemini API key is missing, invalid, or unauthorized.") {
    super(message, 503, "study/invalid-credentials");
    this.name = "StudyProviderAuthError";
  }
}

export class StudyTimeoutError extends StudyProviderError {
  constructor(message = "Study aid generation timed out. Please try analyzing a shorter excerpt.") {
    super(message, 504, "study/timeout");
    this.name = "StudyTimeoutError";
  }
}

export function validateStudyRequest(input: unknown): StudyRequest {
  if (typeof input !== "object" || input === null) throw new StudyInputError("A study request is required.");
  const value = input as Record<string, unknown>;
  if (typeof value.documentKey !== "string" || !/^[0-9a-f]{64}$/.test(value.documentKey)) {
    throw new StudyInputError("A documentKey is required for grounded study requests.");
  }
  const task = value.task;
  const validTasks: StudyTask[] = [
    "summary",
    "key-points",
    "flashcards",
    "quiz",
    "explain",
    "practice-test",
    "revision-plan",
    "weak-topics",
  ];
  if (!validTasks.includes(task as StudyTask)) {
    throw new StudyInputError("The study task is invalid.");
  }
  if (!Array.isArray(value.passages) || value.passages.length === 0 || value.passages.length > 50) {
    throw new StudyInputError("Provide between 1 and 50 source passages.");
  }
  const passages = value.passages.map((passage) => {
    if (typeof passage !== "object" || passage === null) throw new StudyInputError("A source passage is invalid.");
    const item = passage as Record<string, unknown>;
    if (!Number.isInteger(item.pageNumber) || (item.pageNumber as number) < 1 || typeof item.text !== "string" || item.text.trim().length === 0 || item.text.length > 8000) {
      throw new StudyInputError("Each source passage needs a page number and 1–8000 characters of text.");
    }
    return { pageNumber: item.pageNumber as number, text: item.text };
  });
  const total = passages.reduce((sum, passage) => sum + passage.text.length, 0);
  if (total > 100_000) throw new StudyInputError("The study request is too large. Select a smaller section.");
  return {
    documentKey: value.documentKey,
    task: task as StudyTask,
    passages,
    ...(typeof value.question === "string" && value.question.length <= 2000 ? { question: value.question } : {}),
  };
}

export interface StudyProvider {
  generate(request: StudyRequest): Promise<StudyResult>;
}

function taskInstruction(task: StudyTask): string {
  switch (task) {
    case "summary":
      return "Generate a structured Executive Summary based strictly on the provided source passages.\n" +
        "Include:\n" +
        "• Core Overview (1-2 clear, comprehensive paragraphs)\n" +
        "• Key Themes & Primary Insights\n" +
        "• Main Takeaways & Practical Conclusions\n" +
        "Use clear markdown headings, bullet points, and clean formatting.";
    case "key-points":
      return "Extract the core Key Concepts and essential principles from the source passages.\n" +
        "For each concept provide:\n" +
        "• Concept Name (bold)\n" +
        "• Precise Definition grounded in the text\n" +
        "• Significance and practical context in the material\n" +
        "Format as a numbered, well-organized reference guide.";
    case "flashcards":
      return "Generate high-yield study Flashcards from the provided material.\n" +
        "Format every single card using this exact template:\n" +
        "Card [Number]\n" +
        "Q: [Clear, direct question testing recall of a concept, definition, or formula]\n" +
        "A: [Accurate, grounded answer]\n\n" +
        "Produce 6 to 10 flashcards covering all major concepts.";
    case "quiz":
      return "Create an engaging Practice Quiz based strictly on the provided passages.\n" +
        "Provide 4 to 6 multiple-choice questions. For each question:\n" +
        "• Question number and question stem\n" +
        "• Four options labeled A), B), C), D)\n" +
        "• Correct Answer line (e.g. Correct Answer: B)\n" +
        "• Brief Explanation justifying why that option is correct based on the text.";
    case "explain":
      return "Provide a Clear Explanation of the supplied material suitable for a student mastering the topic.\n" +
        "• Break complex mechanisms into intuitive step-by-step logic\n" +
        "• Preserve all equations, formulas, code snippets, and technical notation exactly as in the text\n" +
        "• Use clear pedagogical analogies where helpful to clarify difficult concepts\n" +
        "• Conclude with a 'Quick Mental Model' recap.";
    case "practice-test":
      return "Generate a comprehensive Practice Exam based on the material.\n" +
        "Structure with three distinct sections:\n" +
        "• Section I: Multiple Choice Questions (3 questions)\n" +
        "• Section II: Short Answer / Conceptual Application (2 questions)\n" +
        "• Section III: Extended Synthesis / Problem Solving (1 in-depth question)\n" +
        "• Comprehensive Answer Key and Scoring Rubric at the end.";
    case "revision-plan":
      return "Design a structured, spaced-repetition Revision Schedule based on the complexity and volume of the material.\n" +
        "Include:\n" +
        "• Day 1 (Immediate Review): Core concept mapping & initial retention check\n" +
        "• Day 3 (Active Recall): Flashcard self-testing and formula verification\n" +
        "• Day 7 (Deep Practice): Working practice problems and edge cases\n" +
        "• Day 14 (Mastery Assessment): Mock testing under timed conditions\n" +
        "• Prioritized Checklist: Ranked list of highest-yield topics to review first.";
    case "weak-topics":
      return "Conduct a thorough Diagnostic Gap Analysis on the provided material:\n" +
        "• Difficult Concepts: Identify concepts most prone to misunderstanding or student confusion\n" +
        "• Assumed Prerequisites: Highlight background knowledge the text assumes the reader already knows\n" +
        "• Common Stumbling Blocks: Explain subtle traps, edge cases, or false assumptions\n" +
        "• Remediation Guide: Specific, actionable advice to master the identified gaps.";
  }
}

class GeminiStudyProvider implements StudyProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fallbackModel: string;

  constructor(apiKey: string, model = "gemini-3.5-flash", fallbackModel = "gemini-flash-lite-latest") {
    this.apiKey = apiKey;
    this.model = model;
    this.fallbackModel = fallbackModel;
  }

  async generate(request: StudyRequest): Promise<StudyResult> {
    const sourcePages = [...new Set(request.passages.map((passage) => passage.pageNumber))].sort((a, b) => a - b);
    const source = request.passages.map((passage) => `[Page ${passage.pageNumber}]\n${passage.text}`).join("\n\n");
    const prompt = [
      taskInstruction(request.task),
      "Use only the source passages below. Do not invent facts or citations.",
      request.question ? `User question: ${request.question}` : "",
      source,
      `Source pages available: ${sourcePages.join(", ")}.`,
    ].filter(Boolean).join("\n\n");

    const callModel = async (modelName: string): Promise<Response> => {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      try {
        return await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let response: Response;
    try {
      response = await callModel(this.model);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        throw new StudyTimeoutError();
      }
      throw new StudyProviderError("Network failure connecting to Gemini API.");
    }

    // If primary model is experiencing high demand (503) or is not found (404), retry with fallback model
    if ((response.status === 503 || response.status === 404) && this.fallbackModel && this.fallbackModel !== this.model) {
      try {
        const fallbackRes = await callModel(this.fallbackModel);
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      } catch {
        // Keep original response if fallback failed
      }
    }

    if (!response.ok) {
      let errorMessage = `The study provider returned status ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData?.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Use default error message
      }

      if (
        response.status === 401 ||
        response.status === 403 ||
        errorMessage.toLowerCase().includes("api key not valid") ||
        errorMessage.toLowerCase().includes("api_key_invalid")
      ) {
        throw new StudyProviderAuthError(errorMessage);
      }
      if (response.status === 429) {
        throw new StudyProviderRateLimitError(errorMessage);
      }
      if (response.status === 503) {
        throw new StudyProviderUnavailableError("Gemini service is temporarily experiencing high demand. Please try again in a few moments.");
      }
      throw new StudyProviderError(errorMessage, response.status);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
      throw new StudyProviderError("The supplied text could not be processed due to content safety guidelines.", 400, "study/safety-violation");
    }

    const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new StudyProviderError("The study provider returned an empty response.", 502, "study/empty-response");
    }

    return {
      answer: text.trim().slice(0, 30_000),
      sourcePages,
    };
  }
}

class OpenAICompatibleStudyProvider implements StudyProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(request: StudyRequest): Promise<StudyResult> {
    const sourcePages = [...new Set(request.passages.map((passage) => passage.pageNumber))].sort((a, b) => a - b);
    const source = request.passages.map((passage) => `[Page ${passage.pageNumber}]\n${passage.text}`).join("\n\n");
    const prompt = [
      taskInstruction(request.task),
      "Use only the source passages below. Do not invent facts or citations.",
      request.question ? `User question: ${request.question}` : "",
      source,
      `Source pages available: ${sourcePages.join(", ")}.`,
    ].filter(Boolean).join("\n\n");
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, temperature: 0.2, messages: [{ role: "system", content: "You are Noctra's document-grounded study assistant." }, { role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new Error("The study provider did not return a successful response.");
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const answer = body.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || answer.trim().length === 0) throw new Error("The study provider returned no answer.");
    return { answer: answer.trim().slice(0, 20_000), sourcePages };
  }
}

export function createStudyProvider(env: Record<string, string | undefined> = process.env): StudyProvider | null {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    return new GeminiStudyProvider(geminiKey, env.GEMINI_MODEL?.trim() || "gemini-3.5-flash");
  }

  const baseUrl = env.NOCTRA_AI_BASE_URL?.trim();
  const apiKey = env.NOCTRA_AI_API_KEY?.trim();
  const model = env.NOCTRA_AI_MODEL?.trim();
  if (baseUrl && apiKey && model) {
    return new OpenAICompatibleStudyProvider(baseUrl, apiKey, model);
  }

  return null;
}

export function studyConfigMessage(): string {
  return "The study assistant is not configured on this deployment. No document text was sent anywhere.";
}

