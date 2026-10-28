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
  | "explain";

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
  constructor() {
    super("No study-assistant provider is configured.");
    this.name = "StudyProviderUnavailableError";
  }
}

export function validateStudyRequest(input: unknown): StudyRequest {
  if (typeof input !== "object" || input === null) throw new StudyInputError("A study request is required.");
  const value = input as Record<string, unknown>;
  if (typeof value.documentKey !== "string" || !/^[0-9a-f]{64}$/.test(value.documentKey)) {
    throw new StudyInputError("A documentKey is required for grounded study requests.");
  }
  const task = value.task;
  if (task !== "summary" && task !== "key-points" && task !== "flashcards" && task !== "quiz" && task !== "explain") {
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
    task,
    passages,
    ...(typeof value.question === "string" && value.question.length <= 2000 ? { question: value.question } : {}),
  };
}

export interface StudyProvider {
  generate(request: StudyRequest): Promise<StudyResult>;
}

function taskInstruction(task: StudyTask): string {
  switch (task) {
    case "summary": return "Write a concise, faithful summary.";
    case "key-points": return "Extract the most important key points as a numbered list.";
    case "flashcards": return "Create study flashcards in Q: / A: pairs.";
    case "quiz": return "Create practice questions with answers, using only the supplied passages.";
    case "explain": return "Explain the supplied material clearly for a student, preserving formulas and code exactly where relevant.";
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
  const baseUrl = env.NOCTRA_AI_BASE_URL?.trim();
  const apiKey = env.NOCTRA_AI_API_KEY?.trim();
  const model = env.NOCTRA_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  return new OpenAICompatibleStudyProvider(baseUrl, apiKey, model);
}

export function studyConfigMessage(): string {
  return "The study assistant is not configured on this deployment. No document text was sent anywhere.";
}
