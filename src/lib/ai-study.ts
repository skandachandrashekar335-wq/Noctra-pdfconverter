/**
 * Noctra Study AI 2.0 — Educational Platform & AI Teacher Protocol
 *
 * Server-side study-assistant provider boundary, request validation,
 * objective prompt synthesis, and structured response parsing.
 */

export type StudyTask =
  | "summary"
  | "key-points"
  | "flashcards"
  | "quiz"
  | "explain"
  | "practice-test"
  | "revision-plan"
  | "weak-topics"
  | "teacher-chat"
  | "exam-questions"
  | "evaluate-answer";

export interface StudyPassage {
  pageNumber: number;
  text: string;
  section?: string;
  documentName?: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  correctAnswerLetter: string;
  explanation: string;
  sourceReference?: string;
}

export interface FlashcardItem {
  id: number;
  front: string;
  back: string;
  topic?: string;
  sourceReference?: string;
}

export interface ExamQuestion {
  id: number;
  marks: 2 | 5 | 10;
  type: string;
  question: string;
  modelAnswer: string;
  keyPoints: string[];
  sourceReference?: string;
}

export interface AnswerEvaluation {
  marksAwarded: number;
  maxMarks: number;
  percentage: number;
  isPassing: boolean;
  feedback: string;
  keyPointsCovered: string[];
  missingConcepts: string[];
  strengths: string[];
  areasForImprovement: string[];
  modelAnswer: string;
}

export interface StudyRequest {
  documentKey: string;
  task: StudyTask;
  question?: string;
  userAnswer?: string;
  targetMarks?: 2 | 5 | 10;
  passages: StudyPassage[];
  history?: ChatMessage[];
  examFormat?: string;
  difficulty?: "standard" | "challenging";
  questionCount?: number;
}

export interface StudyResult {
  answer: string;
  task: StudyTask;
  objectiveLabel: string;
  sourcePages: number[];
  sourceDocs: string[];
  quiz?: QuizQuestion[];
  flashcards?: FlashcardItem[];
  examQuestions?: ExamQuestion[];
  evaluation?: AnswerEvaluation;
  provider?: string;
  providerLabel?: string;
  model?: string;
  fallbackOccurred?: boolean;
  fallbackChain?: string[];
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

export const VALID_STUDY_TASKS: readonly StudyTask[] = [
  "summary",
  "key-points",
  "flashcards",
  "quiz",
  "explain",
  "practice-test",
  "revision-plan",
  "weak-topics",
  "teacher-chat",
  "exam-questions",
  "evaluate-answer",
] as const;

export const STUDY_OBJECTIVE_LABELS: Record<StudyTask, string> = {
  summary: "Executive Summary",
  "key-points": "Key Concepts",
  flashcards: "Flashcards",
  quiz: "Practice Quiz",
  explain: "Clear Explanation",
  "practice-test": "Practice Exam",
  "revision-plan": "Revision Schedule",
  "weak-topics": "Gap Analysis",
  "teacher-chat": "AI Teacher",
  "exam-questions": "Exam Preparation Questions",
  "evaluate-answer": "Answer Evaluation",
};

export function validateStudyRequest(input: unknown): StudyRequest {
  if (typeof input !== "object" || input === null) {
    throw new StudyInputError("A study request is required.");
  }
  const value = input as Record<string, unknown>;
  if (typeof value.documentKey !== "string" || !/^[0-9a-f]{32,64}$/.test(value.documentKey)) {
    throw new StudyInputError("A valid documentKey is required for grounded study requests.");
  }

  const task = value.task;
  if (!VALID_STUDY_TASKS.includes(task as StudyTask)) {
    throw new StudyInputError(`The study task "${task}" is invalid. Supported tasks: ${VALID_STUDY_TASKS.join(", ")}`);
  }

  if (!Array.isArray(value.passages) || value.passages.length === 0 || value.passages.length > 100) {
    throw new StudyInputError("Provide between 1 and 100 source passages.");
  }

  const passages: StudyPassage[] = value.passages.map((passage) => {
    if (typeof passage !== "object" || passage === null) {
      throw new StudyInputError("A source passage is invalid.");
    }
    const item = passage as Record<string, unknown>;
    const pageNum = Number.isInteger(item.pageNumber) && (item.pageNumber as number) >= 1 ? (item.pageNumber as number) : 1;
    if (typeof item.text !== "string" || item.text.trim().length === 0 || item.text.length > 8000) {
      throw new StudyInputError("Each source passage needs a page number and 1–8000 characters of text.");
    }
    return {
      pageNumber: pageNum,
      text: item.text,
      ...(typeof item.section === "string" ? { section: item.section } : {}),
      ...(typeof item.documentName === "string" ? { documentName: item.documentName } : {}),
    };
  });

  const total = passages.reduce((sum, passage) => sum + passage.text.length, 0);
  if (total > 150_000) {
    throw new StudyInputError("The study request is too large. Select a smaller chapter or subset of passages.");
  }

  // Validate history for chat
  let history: ChatMessage[] | undefined;
  if (Array.isArray(value.history)) {
    history = value.history
      .filter((m) => typeof m === "object" && m !== null && typeof m.text === "string" && (m.role === "user" || m.role === "model"))
      .slice(-10) as ChatMessage[];
  }

  return {
    documentKey: value.documentKey,
    task: task as StudyTask,
    passages,
    ...(typeof value.question === "string" && value.question.length <= 4000 ? { question: value.question } : {}),
    ...(typeof value.userAnswer === "string" && value.userAnswer.length <= 8000 ? { userAnswer: value.userAnswer } : {}),
    ...(value.targetMarks === 2 || value.targetMarks === 5 || value.targetMarks === 10 ? { targetMarks: value.targetMarks } : {}),
    ...(typeof value.examFormat === "string" ? { examFormat: value.examFormat } : {}),
    ...(value.difficulty === "standard" || value.difficulty === "challenging" ? { difficulty: value.difficulty } : {}),
    ...(typeof value.questionCount === "number" && value.questionCount >= 1 && value.questionCount <= 20 ? { questionCount: value.questionCount } : {}),
    ...(history ? { history } : {}),
  };
}

export interface StudyProvider {
  generate(request: StudyRequest): Promise<StudyResult>;
}

/** Formulates explicit, objective-specific instructions preventing generic summarization */
export function buildTaskInstruction(request: StudyRequest): string {
  const count = request.questionCount || 5;
  const marks = request.targetMarks || 5;

  switch (request.task) {
    case "summary":
      return (
        "TASK: EXECUTIVE SUMMARY\n" +
        "You are Noctra AI generating a structured Executive Summary.\n" +
        "MANDATORY REQUIREMENT: Begin your output with '# 📋 Executive Summary'\n" +
        "Structure the output exactly as follows:\n" +
        "• Core Overview (1-2 cohesive paragraphs capturing the central thesis)\n" +
        "• Key Themes & Structural Architecture\n" +
        "• Critical Takeaways & Practical Conclusions\n" +
        "Ground every claim strictly in the provided text. Cite document and page numbers."
      );

    case "key-points":
      return (
        "TASK: KEY CONCEPTS & DEFINITIONS\n" +
        "You are Noctra AI extracting the core principles from the study material.\n" +
        "MANDATORY REQUIREMENT: Begin your output with '# 🔑 Key Concepts & Definitions'\n" +
        "Do NOT write an executive summary.\n" +
        "Provide a numbered list of core concepts. For each concept:\n" +
        "1. **Concept Name**\n" +
        "   - **Definition:** Exact, rigorous definition as stated or derived from the text.\n" +
        "   - **Context & Significance:** Why it matters within the subject.\n" +
        "   - **Reference:** Cite the source document and page number."
      );

    case "explain":
      return (
        "TASK: CLEAR EXPLANATION (PEDAGOGICAL TEACHING)\n" +
        "You are Noctra AI Teacher explaining concepts to a student.\n" +
        "CRITICAL INSTRUCTION: You MUST start your response with '# 💡 Clear Explanation: " +
        (request.question || "Core Concepts") +
        "'\n" +
        "DO NOT produce an Executive Summary or abstract high-level overview.\n" +
        "Deliver an engaging, student-friendly explanation:\n" +
        "1. **The Big Picture:** Plain-language intuition in 2-3 sentences.\n" +
        "2. **Step-by-Step Breakdown:** Deconstruct the mechanism into clear logical stages.\n" +
        "3. **Exact Formulas / Technical Notation:** Preserve all math, definitions, or code exactly as in the text.\n" +
        "4. **Pedagogical Analogy / Real-World Example:** Illustrate with an intuitive mental model.\n" +
        "5. **Quick Mental Model Recap:** 2 bullet points to remember for exams."
      );

    case "teacher-chat":
      return (
        "TASK: INTERACTIVE AI TEACHER CONVERSATION\n" +
        "You are Noctra AI, an encouraging, rigorous personal tutor. The student is conversing with you directly.\n" +
        "• Teach and clarify concepts directly using the uploaded study materials as your primary authority.\n" +
        "• Always answer the student's specific question or request directly.\n" +
        "• If the student's question asks for an analogy, step-by-step walkthrough, or exam tips, provide them clearly.\n" +
        "• Ground your explanations with specific citations: [Document Name - Page N].\n" +
        "• If the uploaded materials do NOT contain enough information to answer a question, explicitly state: 'Based on your uploaded study materials, this topic is not covered in detail, but conceptually...' and clarify the distinction.\n" +
        "• Conclude by asking a friendly check-for-understanding question to test their retention."
      );

    case "exam-questions":
      return (
        "TASK: EXAM QUESTION GENERATION\n" +
        "Generate authentic academic examination questions based strictly on the provided study material.\n" +
        "MANDATORY REQUIREMENT: Begin your output with '# 📝 Examination Questions & Model Answers'\n" +
        "Generate a balanced set of questions categorized by marks:\n" +
        "### A. 2-Mark Short Answer Questions (Definitions, Formulae, Distinctions)\n" +
        "For each 2-mark question, provide the question, expected 2 key points, and a 20-30 word model answer.\n\n" +
        "### B. 5-Mark Medium Answer Questions (Structured Explanations, Comparisons, Mechanisms)\n" +
        "For each 5-mark question, provide the question, marking scheme (5 points), and a structured 100-word model answer.\n\n" +
        "### C. 10-Mark Long Answer Questions (In-Depth Essays, Architectures, Problem Solving)\n" +
        "For each 10-mark question, provide the question, comprehensive outline with subheadings, and a complete model answer.\n" +
        "Cite source documents and pages for each question."
      );

    case "quiz":
      return (
        "TASK: INTERACTIVE PRACTICE QUIZ (STRUCTURED JSON)\n" +
        `Generate exactly ${count} challenging multiple-choice questions grounded in the provided passages.\n` +
        "You MUST return your answer as a JSON block wrapped in ```json ... ``` with this exact array structure:\n" +
        "[\n" +
        "  {\n" +
        "    \"id\": 1,\n" +
        "    \"question\": \"Question stem text?\",\n" +
        "    \"options\": [\"Option A text\", \"Option B text\", \"Option C text\", \"Option D text\"],\n" +
        "    \"correctIndex\": 0,\n" +
        "    \"correctAnswerLetter\": \"A\",\n" +
        "    \"explanation\": \"Grounded explanation of why this option is correct.\",\n" +
        "    \"sourceReference\": \"Document Name | Page N\"\n" +
        "  }\n" +
        "]\n" +
        "Ensure all four options are plausible and distinct. The correct answer must be unambiguously supported by the text."
      );

    case "flashcards":
      return (
        "TASK: ACTIVE RECALL FLASHCARDS (STRUCTURED JSON)\n" +
        `Generate ${count} high-yield study flashcards covering the most critical definitions, equations, and mechanisms.\n` +
        "You MUST return your answer as a JSON block wrapped in ```json ... ``` with this exact array structure:\n" +
        "[\n" +
        "  {\n" +
        "    \"id\": 1,\n" +
        "    \"front\": \"Term or focused question for active recall?\",\n" +
        "    \"back\": \"Precise definition, answer, or formula explanation grounded in the text.\",\n" +
        "    \"topic\": \"Topic or Chapter name\",\n" +
        "    \"sourceReference\": \"Document Name | Page N\"\n" +
        "  }\n" +
        "]"
      );

    case "evaluate-answer":
      return (
        "TASK: STUDENT ANSWER EVALUATION (RIGOROUS GRADING RUBRIC)\n" +
        `The student was asked to answer an exam question worth ${marks} marks.\n` +
        `Question: ${request.question || "Study Question"}\n` +
        `Student's Written Answer: ${request.userAnswer || "(No answer provided)"}\n\n` +
        "Evaluate the student's answer strictly against the facts in the provided study material.\n" +
        "You MUST return your evaluation as a JSON block wrapped in ```json ... ``` with this exact structure:\n" +
        "{\n" +
        `  \"marksAwarded\": 0,\n` +
        `  \"maxMarks\": ${marks},\n` +
        `  \"percentage\": 0,\n` +
        "  \"isPassing\": true,\n" +
        "  \"feedback\": \"Coaching summary explaining the overall assessment.\",\n" +
        "  \"keyPointsCovered\": [\"Points the student correctly included\"],\n" +
        "  \"missingConcepts\": [\"Essential terms or concepts the student missed\"],\n" +
        "  \"strengths\": [\"Specific accurate terminology or logic demonstrated\"],\n" +
        "  \"areasForImprovement\": [\"Actionable guidance on how to reach full marks\"],\n" +
        "  \"modelAnswer\": \"The ideal exam-ready answer that would receive 100% full marks.\"\n" +
        "}\n" +
        "Do not be overly lenient: deduct marks for missing core terminology, inaccurate assertions, or vague explanations."
      );

    case "practice-test":
      return (
        "TASK: COMPLETE PRACTICE EXAMINATION PAPER\n" +
        "MANDATORY REQUIREMENT: Begin your output with '# 📄 Practice Examination Paper'\n" +
        "Create an authentic formal exam paper:\n" +
        "• Section I: 5 Multiple Choice Questions (1 mark each)\n" +
        "• Section II: 3 Short Answer Questions (2 marks each)\n" +
        "• Section III: 2 Structured Analytical Questions (5 marks each)\n" +
        "• Complete Answer Key and Detailed Marking Rubric at the very end."
      );

    case "revision-plan":
      return (
        "TASK: SPACED-REPETITION REVISION SCHEDULE\n" +
        "MANDATORY REQUIREMENT: Begin your output with '# 📅 Spaced-Repetition Revision Schedule'\n" +
        "Design a practical, milestone-driven revision schedule:\n" +
        "• Day 1 (Immediate Consolidation): Concept mapping & core definitions\n" +
        "• Day 3 (Active Recall Testing): Flashcard drill and formula recitation\n" +
        "• Day 7 (Applied Problem Solving): 5-mark question practice under timed conditions\n" +
        "• Day 14 (Exam Readiness Benchmark): Mock test and weak topic remediation\n" +
        "• Prioritized Topic Hierarchy: Ranked list of high-weightage topics to review first."
      );

    case "weak-topics":
      return (
        "TASK: DIAGNOSTIC GAP ANALYSIS & WEAK TOPIC REMEDIATION\n" +
        "MANDATORY REQUIREMENT: Begin your output with '# 🔍 Diagnostic Gap Analysis'\n" +
        "Conduct a diagnostic audit of the material:\n" +
        "• Conceptual Traps: Points where students frequently confuse definitions or processes\n" +
        "• Implicit Prerequisites: Background knowledge the material assumes the reader already possesses\n" +
        "• High-Yield Exam Pitfalls: Common errors made in exam conditions\n" +
        "• Remediation Checklist: Step-by-step mastery guide for the hardest topics."
      );
  }
}

/** Extracts JSON data from LLM responses with robust markdown fence handling */
export function extractJsonFromResponse<T>(text: string): T | null {
  try {
    // 1. Try direct JSON parse
    return JSON.parse(text) as T;
  } catch {
    // 2. Try parsing within ```json ... ``` code fence
    const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    if (match) {
      try {
        return JSON.parse(match[1].trim()) as T;
      } catch {}
    }

    // 3. Try finding first '[' or '{' to last ']' or '}'
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(text.slice(firstBracket, lastBracket + 1)) as T;
      } catch {}
    }

    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as T;
      } catch {}
    }
  }
  return null;
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
    const sourcePages = [...new Set(request.passages.map((p) => p.pageNumber))].sort((a, b) => a - b);
    const sourceDocs = [...new Set(request.passages.map((p) => p.documentName).filter(Boolean))] as string[];

    const sourceContext = request.passages
      .map((p) => {
        const docPrefix = p.documentName ? `[${p.documentName} | Page ${p.pageNumber}]` : `[Page ${p.pageNumber}]`;
        return `${docPrefix}\n${p.text}`;
      })
      .join("\n\n");

    const instruction = buildTaskInstruction(request);

    // Build conversation context
    const parts: string[] = [instruction];

    if (request.history && request.history.length > 0) {
      parts.push("PRIOR CONVERSATION HISTORY:");
      for (const msg of request.history) {
        parts.push(`${msg.role === "user" ? "Student" : "Teacher"}: ${msg.text}`);
      }
    }

    if (request.question) {
      parts.push(`STUDENT QUERY / PROMPT:\n${request.question}`);
    }

    parts.push(`GROUNDED SOURCE PASSAGES:\n${sourceContext}`);
    parts.push(`Source pages available: ${sourcePages.join(", ")}. Documents: ${sourceDocs.join(", ") || "Uploaded Study Material"}.`);

    const prompt = parts.join("\n\n");

    const callModel = async (modelName: string): Promise<Response> => {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35_000);

      try {
        return await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: request.task === "quiz" || request.task === "evaluate-answer" ? 0.1 : 0.25,
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

    // High demand fallback
    if ((response.status === 503 || response.status === 404) && this.fallbackModel && this.fallbackModel !== this.model) {
      try {
        const fallbackRes = await callModel(this.fallbackModel);
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      } catch {}
    }

    if (!response.ok) {
      let errorMessage = `The study provider returned status ${response.status}`;
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

    const rawText = candidate?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
    if (typeof rawText !== "string" || rawText.trim().length === 0) {
      throw new StudyProviderError("The study provider returned an empty response.", 502, "study/empty-response");
    }

    const answer = rawText.trim().slice(0, 40_000);
    const objectiveLabel = STUDY_OBJECTIVE_LABELS[request.task] || "Study Aid";

    // Attempt to parse structured data based on task
    let quiz: QuizQuestion[] | undefined;
    let flashcards: FlashcardItem[] | undefined;
    let evaluation: AnswerEvaluation | undefined;

    if (request.task === "quiz") {
      const parsed = extractJsonFromResponse<QuizQuestion[]>(answer);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].question === "string") {
        quiz = parsed;
      }
    } else if (request.task === "flashcards") {
      const parsed = extractJsonFromResponse<FlashcardItem[]>(answer);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].front === "string") {
        flashcards = parsed;
      }
    } else if (request.task === "evaluate-answer") {
      const parsed = extractJsonFromResponse<AnswerEvaluation>(answer);
      if (parsed && typeof parsed.marksAwarded === "number" && typeof parsed.feedback === "string") {
        evaluation = parsed;
      }
    }

    return {
      answer,
      task: request.task,
      objectiveLabel,
      sourcePages,
      sourceDocs,
      quiz,
      flashcards,
      evaluation,
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
    const sourcePages = [...new Set(request.passages.map((p) => p.pageNumber))].sort((a, b) => a - b);
    const sourceDocs = [...new Set(request.passages.map((p) => p.documentName).filter(Boolean))] as string[];
    const source = request.passages.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
    const instruction = buildTaskInstruction(request);

    const prompt = [
      instruction,
      request.question ? `User question: ${request.question}` : "",
      `Source material:\n${source}`,
    ].filter(Boolean).join("\n\n");

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You are Noctra's document-grounded AI study assistant and personal tutor." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) throw new Error("The study provider did not return a successful response.");
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const answer = body.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || answer.trim().length === 0) throw new Error("The study provider returned no answer.");

    return {
      answer: answer.trim().slice(0, 30_000),
      task: request.task,
      objectiveLabel: STUDY_OBJECTIVE_LABELS[request.task] || "Study Aid",
      sourcePages,
      sourceDocs,
    };
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
