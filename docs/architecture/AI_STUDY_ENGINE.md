# AI Study Engine

Noctra's AI Study feature transforms converted documents into interactive study tools. All AI calls are made server-side; API keys never reach the browser.

---

## Study Task Types

The engine supports **11 study task types**, each producing a structured response:

| Task ID | Description | Output format |
|---|---|---|
| `summary` | Concise summary of the document or passage | Plain text |
| `key-points` | Bulleted list of the most important concepts | Markdown list |
| `flashcards` | Question/answer pairs for active recall | JSON array of `{question, answer}` |
| `quiz` | Multiple-choice questions with correct answer | JSON array of `{question, options[], correct, explanation}` |
| `explain` | Plain-language explanation of a concept | Plain text |
| `practice-test` | Short-answer practice questions | Plain text with questions separated by `---` |
| `revision-plan` | Structured study schedule based on the material | Markdown with sections |
| `weak-topics` | Identifies likely difficult areas for the user | Markdown list |
| `teacher-chat` | Conversational Q&A about the material | Plain text |
| `exam-questions` | Realistic exam-style questions | Plain text |
| `evaluate-answer` | Scores and critiques a user's answer | Structured text with score + feedback |

---

## Data Shapes

### `StudyRequest`

Sent from the browser to `POST /api/study`:

```typescript
interface StudyRequest {
  task: StudyTask;           // one of the 11 task IDs above
  passages: string[];        // extracted text segments from the document
  context?: string;          // optional: extra context (e.g., subject area)
  userAnswer?: string;       // only for 'evaluate-answer' task
  chatHistory?: ChatMessage[]; // only for 'teacher-chat' task
}

type StudyTask =
  | 'summary' | 'key-points' | 'flashcards' | 'quiz'
  | 'explain' | 'practice-test' | 'revision-plan' | 'weak-topics'
  | 'teacher-chat' | 'exam-questions' | 'evaluate-answer';
```

### `StudyResult`

Returned from `POST /api/study`:

```typescript
interface StudyResult {
  task: StudyTask;
  content: string;           // raw AI response (may be JSON string for structured tasks)
  parsed?: {                 // populated for structured tasks
    flashcards?: FlashCard[];
    quiz?: QuizQuestion[];
  };
  provider: string;          // which provider answered: 'gemini-primary' | 'gemini-secondary' | 'openrouter'
  model: string;             // exact model ID used
  fallbackOccurred: boolean; // true if a higher-priority provider was skipped
}

interface FlashCard {
  question: string;
  answer: string;
}

interface QuizQuestion {
  question: string;
  options: string[];         // 4 options, labelled A–D
  correct: string;           // 'A' | 'B' | 'C' | 'D'
  explanation: string;
}
```

---

## Prompt Construction

Prompts are constructed in [`src/lib/ai-study.ts`](../../src/lib/ai-study.ts) using a task-specific template. The general structure is:

```
[System instruction: role, output format, factual grounding requirement]

[Document passages — up to the model's context window]

[Task-specific instruction]
```

Key prompt engineering decisions:

- **Factual grounding**: The system instruction explicitly forbids the model from introducing facts not present in the provided passages. This reduces hallucination for study content.
- **Format enforcement**: Structured tasks (quiz, flashcards) include a JSON schema in the prompt and a reminder that the entire response must be valid JSON.
- **Length guidance**: Each task specifies a target length (e.g., "summary in 3–5 sentences", "10 flashcard pairs").
- **Language matching**: The prompt instructs the model to respond in the same language as the document passages.

---

## Response Parsing

For structured output tasks (`quiz`, `flashcards`), the API route:

1. Receives the raw AI text response.
2. Attempts `JSON.parse()` on the full response.
3. If that fails, applies a regex to extract the first JSON array found in the response (handles models that wrap JSON in prose).
4. Validates the parsed structure against the expected schema.
5. Returns both `content` (raw) and `parsed` (structured) in the `StudyResult`.

If parsing fails entirely, the result is returned as `content`-only (plain text), allowing the UI to fall back to rendering the raw response.

---

## Key Source Files

| File | Purpose |
|---|---|
| [`src/lib/ai-study.ts`](../../src/lib/ai-study.ts) | Prompt templates, task orchestration, response parsing |
| [`src/lib/ai-provider-engine.ts`](../../src/lib/ai-provider-engine.ts) | 3-tier provider fallback, health tracking |
| [`src/app/api/study/route.ts`](../../src/app/api/study/route.ts) | HTTP endpoint, Firebase token verification, rate limiting |
| [`src/lib/study-material-extractor.ts`](../../src/lib/study-material-extractor.ts) | Text extraction from PDF/PPTX for study input |

---

## Consent Gateway

**No AI call is ever made without explicit user consent.** The UI presents a consent dialog the first time the user initiates a study task on any document. Consent is:

- Stored per-session in browser state
- Re-requested after a browser reload
- Never assumed from a previous session

The API route additionally validates the `X-Study-Consent: granted` header; requests without it are rejected with `403`.

---

## Related Documentation

- [AI Provider Fallback](./AI_PROVIDER_FALLBACK.md)
- [Data Flow](./DATA_FLOW.md)
- [Security Model](../security/SECURITY_MODEL.md)
