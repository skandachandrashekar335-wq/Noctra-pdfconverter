/**
 * Noctra Multi-Provider AI Fallback Engine
 *
 * Implements a strict sequential 3-level fallback architecture:
 *   1. Gemini Primary
 *   2. Gemini Secondary
 *   3. OpenRouter Free Tier
 *
 * Designed to guarantee high availability for Noctra Study AI:
 * - Never executes providers concurrently (sequential fallback only)
 * - Transparently handles rate limits (429), timeouts, 5xx outages, and malformed JSON
 * - Preserves user document privacy and returns normalized study metadata
 * - Completely server-side (zero credential exposure)
 */

import {
  type StudyRequest,
  type StudyResult,
  type QuizQuestion,
  type FlashcardItem,
  type ExamQuestion,
  type AnswerEvaluation,
  StudyProviderUnavailableError,
  StudyProviderRateLimitError,
  StudyProviderAuthError,
  StudyProviderError,
  StudyTimeoutError,
  STUDY_OBJECTIVE_LABELS,
  buildTaskInstruction,
  extractJsonFromResponse,
} from "./ai-study.ts";

export type AIProviderId = "gemini-primary" | "gemini-secondary" | "openrouter";

export interface AIProviderStatus {
  id: AIProviderId;
  name: string;
  model: string;
  configured: boolean;
  keyStatus: "dedicated" | "shared" | "unconfigured";
}

export interface ProviderRawOutput {
  rawText: string;
  provider: AIProviderId;
  model: string;
}

export interface AIProviderAdapter {
  readonly id: AIProviderId;
  readonly displayName: string;
  readonly model: string;
  isConfigured(): boolean;
  getKeyStatus?(): "dedicated" | "shared" | "unconfigured";
  generate(request: StudyRequest, signal?: AbortSignal): Promise<ProviderRawOutput>;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI PROVIDER ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export interface GeminiAdapterConfig {
  id: "gemini-primary" | "gemini-secondary";
  displayName: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  isSharedKey?: boolean;
}

export class GeminiProviderAdapter implements AIProviderAdapter {
  readonly id: "gemini-primary" | "gemini-secondary";
  readonly displayName: string;
  readonly model: string;
  readonly isSharedKey: boolean;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config: GeminiAdapterConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.model = config.model;
    this.apiKey = config.apiKey?.trim();
    this.timeoutMs = config.timeoutMs ?? 28_000;
    this.isSharedKey = Boolean(config.isSharedKey);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0 && this.model);
  }

  getKeyStatus(): "dedicated" | "shared" | "unconfigured" {
    if (!this.isConfigured()) return "unconfigured";
    return this.isSharedKey ? "shared" : "dedicated";
  }

  async generate(request: StudyRequest, signal?: AbortSignal): Promise<ProviderRawOutput> {
    if (!this.apiKey) {
      throw new StudyProviderAuthError(`${this.displayName} API key is not configured.`);
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    // Link caller signal if provided
    let abortListener: (() => void) | undefined;
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutTimer);
        const abortErr = new Error("Study request was aborted.");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      abortListener = () => controller.abort();
      signal.addEventListener("abort", abortListener);
    }

    try {
      const source = request.passages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
      const instruction = buildTaskInstruction(request);

      const userPrompt = [
        instruction,
        request.question ? `User Question / Instruction:\n${request.question}` : "",
        request.userAnswer ? `User Submitted Answer for Evaluation:\n${request.userAnswer}` : "",
        `Source Material Excerpts:\n${source}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const systemInstructionText =
        "You are Noctra's AI study tutor and exam preparation platform. " +
        "Ground your answers strictly in the provided study material. " +
        "Never cite facts or information not supported by the document. " +
        "Follow formatting instructions precisely.";

      const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

      // Add conversation history for chat tasks if present
      if (request.history && request.history.length > 0) {
        for (const msg of request.history) {
          contents.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text }],
          });
        }
      }

      contents.push({
        role: "user",
        parts: [{ text: userPrompt }],
      });

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemInstructionText }],
          },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `${this.displayName} returned HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch {}

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
        if (response.status === 503 || response.status === 502 || response.status === 504 || response.status === 500) {
          throw new StudyProviderError(errorMessage, response.status, "study/upstream-failure");
        }
        if (response.status === 404) {
          throw new StudyProviderError(`Model "${this.model}" not found on ${this.displayName}.`, 404, "study/model-not-found");
        }
        throw new StudyProviderError(errorMessage, response.status);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason === "SAFETY") {
        throw new StudyProviderError(
          "The supplied text could not be processed due to content safety guidelines.",
          400,
          "study/safety-violation"
        );
      }

      const rawText = candidate?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
      if (typeof rawText !== "string" || rawText.trim().length === 0) {
        throw new StudyProviderError(`${this.displayName} returned an empty response.`, 502, "study/empty-response");
      }

      return {
        rawText: rawText.trim(),
        provider: this.id,
        model: this.model,
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        if (signal?.aborted) {
          throw err;
        }
        throw new StudyTimeoutError(`${this.displayName} request timed out after ${this.timeoutMs / 1000}s.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
      if (signal && abortListener) {
        signal.removeEventListener("abort", abortListener);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OPENROUTER PROVIDER ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenRouterAdapterConfig {
  displayName?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class OpenRouterProviderAdapter implements AIProviderAdapter {
  readonly id = "openrouter" as const;
  readonly displayName: string;
  readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(config: OpenRouterAdapterConfig = {}) {
    this.displayName = config.displayName || "OpenRouter Free";
    this.apiKey = config.apiKey?.trim();
    this.model = config.model?.trim() || "nvidia/nemotron-3.5-lightning:free";
    this.timeoutMs = config.timeoutMs ?? 28_000;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0 && this.model);
  }

  getKeyStatus(): "dedicated" | "shared" | "unconfigured" {
    return this.isConfigured() ? "dedicated" : "unconfigured";
  }

  async generate(request: StudyRequest, signal?: AbortSignal): Promise<ProviderRawOutput> {
    if (!this.apiKey) {
      throw new StudyProviderAuthError("OpenRouter API key is not configured.");
    }

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    let abortListener: (() => void) | undefined;
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeoutTimer);
        const abortErr = new Error("Study request was aborted.");
        abortErr.name = "AbortError";
        throw abortErr;
      }
      abortListener = () => controller.abort();
      signal.addEventListener("abort", abortListener);
    }

    try {
      const source = request.passages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
      const instruction = buildTaskInstruction(request);

      const requiresJson = request.task === "quiz" || request.task === "flashcards" || request.task === "evaluate-answer";
      const jsonNotice = requiresJson
        ? "\n\nCRITICAL: Respond ONLY with valid, raw, parseable JSON. Do not wrap in markdown quotes or code fences. No conversational text."
        : "";

      const userPrompt = [
        instruction,
        request.question ? `User Question / Instruction:\n${request.question}` : "",
        request.userAnswer ? `User Submitted Answer for Evaluation:\n${request.userAnswer}` : "",
        `Source Material Excerpts:\n${source}`,
        jsonNotice,
      ]
        .filter(Boolean)
        .join("\n\n");

      const systemMessage =
        "You are Noctra's AI study tutor and exam preparation platform. " +
        "Ground your answers strictly in the provided study material. " +
        "Never invent details not present in the excerpts. Follow formatting instructions faithfully.";

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemMessage },
      ];

      if (request.history && request.history.length > 0) {
        for (const msg of request.history) {
          messages.push({
            role: msg.role === "model" ? "assistant" : "user",
            content: msg.text,
          });
        }
      }

      messages.push({
        role: "user",
        content: userPrompt,
      });

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://noctra-pdfconverter.vercel.app",
          "X-Title": "Noctra Study AI",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: 4096,
          reasoning: { effort: "none" },
          messages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `OpenRouter returned HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errorMessage = errData.error.message;
          }
        } catch {}

        if (response.status === 401 || response.status === 403) {
          throw new StudyProviderAuthError(errorMessage);
        }
        if (response.status === 429) {
          throw new StudyProviderRateLimitError(errorMessage);
        }
        if (response.status === 404) {
          throw new StudyProviderError(`Model "${this.model}" not found on OpenRouter.`, 404, "study/model-not-found");
        }
        throw new StudyProviderError(errorMessage, response.status);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown; reasoning?: unknown } }>;
      };

      const msg = body.choices?.[0]?.message;
      let rawContent = typeof msg?.content === "string" ? msg.content : "";
      if (!rawContent && typeof msg?.reasoning === "string") {
        rawContent = msg.reasoning;
      }

      if (!rawContent || rawContent.trim().length === 0) {
        throw new StudyProviderError("OpenRouter returned an empty response.", 502, "study/empty-response");
      }

      return {
        rawText: rawContent.trim(),
        provider: this.id,
        model: this.model,
      };
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        if (signal?.aborted) {
          throw err;
        }
        throw new StudyTimeoutError(`OpenRouter request timed out after ${this.timeoutMs / 1000}s.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutTimer);
      if (signal && abortListener) {
        signal.removeEventListener("abort", abortListener);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSING & STRUCTURED OUTPUT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedStudyOutput {
  valid: boolean;
  reason?: string;
  answer: string;
  quiz?: QuizQuestion[];
  flashcards?: FlashcardItem[];
  examQuestions?: ExamQuestion[];
  evaluation?: AnswerEvaluation;
}

export function parseAndValidateStudyOutput(rawText: string, request: StudyRequest): ParsedStudyOutput {
  if (!rawText || rawText.trim().length === 0) {
    return { valid: false, reason: "Output text was empty.", answer: "" };
  }

  const answer = rawText.trim().slice(0, 50_000);

  if (request.task === "quiz") {
    const parsed = extractJsonFromResponse<QuizQuestion[]>(answer);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { valid: false, reason: "Failed to parse structured Quiz questions array from LLM output.", answer };
    }
    const first = parsed[0];
    if (typeof first.question !== "string" || !Array.isArray(first.options) || first.options.length < 2) {
      return { valid: false, reason: "Quiz questions do not match required schema (question, options).", answer };
    }
    return { valid: true, answer, quiz: parsed };
  }

  if (request.task === "flashcards") {
    const parsed = extractJsonFromResponse<FlashcardItem[]>(answer);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { valid: false, reason: "Failed to parse structured Flashcards array from LLM output.", answer };
    }
    const first = parsed[0];
    if (typeof first.front !== "string" || typeof first.back !== "string") {
      return { valid: false, reason: "Flashcard items do not match required schema (front, back).", answer };
    }
    return { valid: true, answer, flashcards: parsed };
  }

  if (request.task === "evaluate-answer") {
    const parsed = extractJsonFromResponse<AnswerEvaluation>(answer);
    if (!parsed || typeof parsed.marksAwarded !== "number" || typeof parsed.feedback !== "string") {
      return { valid: false, reason: "Failed to parse structured AnswerEvaluation object from LLM output.", answer };
    }
    return { valid: true, answer, evaluation: parsed };
  }

  if (request.task === "exam-questions") {
    const parsed = extractJsonFromResponse<ExamQuestion[]>(answer);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].question === "string") {
      return { valid: true, answer, examQuestions: parsed };
    }
    // Exam questions can also render as markdown text
    return { valid: true, answer };
  }

  // Text-based objectives (summary, key-points, explain, revision-plan, weak-topics, teacher-chat, practice-test)
  if (answer.length < 10) {
    return { valid: false, reason: "LLM output was excessively short.", answer };
  }

  return { valid: true, answer };
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-PROVIDER FALLBACK ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class MultiProviderFallbackEngine {
  private readonly adapters: AIProviderAdapter[];

  constructor(adapters: AIProviderAdapter[]) {
    this.adapters = adapters;
  }

  /**
   * Returns metadata and health status for each provider without exposing secrets.
   */
  getProviderStatuses(): AIProviderStatus[] {
    return this.adapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.displayName,
      model: adapter.model,
      configured: adapter.isConfigured(),
      keyStatus: adapter.getKeyStatus ? adapter.getKeyStatus() : (adapter.isConfigured() ? "dedicated" : "unconfigured"),
    }));
  }

  /**
   * Sequentially executes the fallback sequence:
   *   1. Gemini Primary
   *   2. Gemini Secondary
   *   3. OpenRouter Free
   *
   * Stops immediately upon first success or client-initiated abort.
   */
  async generate(request: StudyRequest, signal?: AbortSignal): Promise<StudyResult> {
    const attemptedProviders: AIProviderId[] = [];
    const failureLog: Array<{ provider: AIProviderId; model: string; error: string }> = [];

    const sourcePages = [...new Set(request.passages.map((p) => p.pageNumber))].sort((a, b) => a - b);
    const sourceDocs = [...new Set(request.passages.map((p) => p.documentName).filter(Boolean))] as string[];
    const objectiveLabel = STUDY_OBJECTIVE_LABELS[request.task] || "Study Aid";

    // Sequential loop over configured adapters
    for (let i = 0; i < this.adapters.length; i++) {
      const adapter = this.adapters[i];

      // If client aborted, stop immediately without touching further providers
      if (signal?.aborted) {
        const abortErr = new Error("Study request aborted by caller.");
        abortErr.name = "AbortError";
        throw abortErr;
      }

      // Skip unconfigured adapters gracefully
      if (!adapter.isConfigured()) {
        continue;
      }

      attemptedProviders.push(adapter.id);

      try {
        const rawOutput = await adapter.generate(request, signal);

        // Validate output structure for structured tasks
        const parsed = parseAndValidateStudyOutput(rawOutput.rawText, request);
        if (!parsed.valid) {
          throw new StudyProviderError(
            `Output validation failed: ${parsed.reason}`,
            502,
            "study/malformed-output"
          );
        }

        const fallbackOccurred = attemptedProviders.length > 1;

        return {
          answer: parsed.answer,
          task: request.task,
          objectiveLabel,
          sourcePages,
          sourceDocs,
          quiz: parsed.quiz,
          flashcards: parsed.flashcards,
          examQuestions: parsed.examQuestions,
          evaluation: parsed.evaluation,
          provider: adapter.id,
          providerLabel: adapter.displayName,
          model: adapter.model,
          fallbackOccurred,
          fallbackChain: attemptedProviders,
        };
      } catch (err: unknown) {
        // If client aborted, re-throw immediately and do NOT proceed
        if (signal?.aborted || ((err as Error)?.name === "AbortError" && signal?.aborted)) {
          throw err;
        }

        const errMsg = err instanceof Error ? err.message : String(err);
        failureLog.push({
          provider: adapter.id,
          model: adapter.model,
          error: errMsg,
        });

        console.warn(
          `[Noctra AI Fallback Engine] Provider ${adapter.displayName} (${adapter.model}) failed: ${errMsg}. ` +
            `Proceeding to next provider...`
        );
      }
    }

    // All available providers were tried and failed
    if (attemptedProviders.length === 0) {
      throw new StudyProviderUnavailableError(
        "No AI study providers are configured on this deployment. Please configure GEMINI_API_KEY or OPENROUTER_API_KEY."
      );
    }

    const logSummary = failureLog.map((f) => `[${f.provider} / ${f.model}: ${f.error}]`).join(" | ");
    throw new StudyProviderUnavailableError(
      `All AI study providers were unavailable (${failureLog.length} attempted). ${logSummary}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates the production 3-level fallback engine using server environment variables.
 */
export function createFallbackEngine(env: Record<string, string | undefined> = process.env): MultiProviderFallbackEngine {
  const geminiPrimaryApiKey = env.GEMINI_API_KEY?.trim();
  const geminiPrimaryModel = env.GEMINI_PRIMARY_MODEL?.trim() || env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";

  const geminiSecondaryCustomKey = env.GEMINI_SECONDARY_API_KEY?.trim();
  const geminiSecondaryApiKey = geminiSecondaryCustomKey || geminiPrimaryApiKey;
  const isSecondarySharedKey = Boolean(
    geminiPrimaryApiKey &&
    geminiSecondaryApiKey &&
    (!geminiSecondaryCustomKey || geminiSecondaryCustomKey === geminiPrimaryApiKey)
  );
  const geminiSecondaryModel = env.GEMINI_SECONDARY_MODEL?.trim() || "gemini-flash-lite-latest";

  const openRouterApiKey = env.OPENROUTER_API_KEY?.trim();
  const openRouterModel = env.OPENROUTER_MODEL?.trim() || "nvidia/nemotron-3.5-lightning:free";

  const adapters: AIProviderAdapter[] = [
    new GeminiProviderAdapter({
      id: "gemini-primary",
      displayName: "Gemini Primary",
      apiKey: geminiPrimaryApiKey,
      model: geminiPrimaryModel,
      isSharedKey: false,
    }),
    new GeminiProviderAdapter({
      id: "gemini-secondary",
      displayName: "Gemini Secondary",
      apiKey: geminiSecondaryApiKey,
      model: geminiSecondaryModel,
      isSharedKey: isSecondarySharedKey,
    }),
    new OpenRouterProviderAdapter({
      displayName: "OpenRouter Free",
      apiKey: openRouterApiKey,
      model: openRouterModel,
    }),
  ];

  return new MultiProviderFallbackEngine(adapters);
}
