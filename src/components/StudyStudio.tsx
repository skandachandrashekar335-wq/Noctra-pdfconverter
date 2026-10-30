"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import type {
  StudyTask,
  QuizQuestion,
  FlashcardItem,
  AnswerEvaluation,
} from "@/lib/ai-study";
import {
  extractStudyMaterial,
  type StudyMaterial,
  type ExtractionProgress,
} from "@/lib/study-material-extractor";
import { buildGroundedContext } from "@/lib/study-context";

type WorkspaceTab = "materials" | "teacher" | "exam" | "quiz" | "flashcards" | "revision";

interface ChatMessageItem {
  id: string;
  role: "user" | "model";
  text: string;
  timestamp: number;
  sources?: string[];
}

interface WeakTopicItem {
  id: string;
  topic: string;
  sourceDoc: string;
  identifiedFrom: "quiz" | "flashcard" | "evaluation";
  timestamp: number;
}

const SAMPLE_MATERIAL: StudyMaterial = {
  id: "sample-neural-networks",
  name: "Introduction_to_Neural_Networks.txt",
  size: 8400,
  type: "txt",
  pageCount: 3,
  subject: "Computer Science",
  chapter: "Deep Learning Fundamentals",
  isScanned: false,
  uploadedAt: Date.now(),
  totalChars: 3850,
  previewSnippet: "Artificial Neural Networks (ANNs) are computational models inspired by biological neural networks in the human brain...",
  passages: [
    {
      pageNumber: 1,
      section: "Section 1.1: Perceptrons & Architecture",
      documentName: "Introduction_to_Neural_Networks.txt",
      text: "Artificial Neural Networks (ANNs) consist of interconnected nodes (neurons) organized into layers: an input layer, one or more hidden layers, and an output layer. Each connection has an associated weight (w) and each neuron has a bias (b). The activation of a neuron is given by a = f(sum(w_i * x_i) + b), where f is a non-linear activation function such as ReLU (f(z) = max(0, z)), Sigmoid (f(z) = 1 / (1 + e^-z)), or Tanh. Non-linear activation functions are essential because without them, any multi-layer neural network collapses into a single linear transformation regardless of depth.",
    },
    {
      pageNumber: 2,
      section: "Section 1.2: Forward Propagation & Loss",
      documentName: "Introduction_to_Neural_Networks.txt",
      text: "During forward propagation, input features are fed through the network to compute the predicted output y_hat. The performance is measured using a loss function L(y, y_hat). For binary classification tasks, Binary Cross-Entropy (Log Loss) is commonly used: L = -[y * log(y_hat) + (1 - y) * log(1 - y_hat)]. For multi-class classification, Softmax activation is paired with Categorical Cross-Entropy. For regression, Mean Squared Error (MSE) is standard: MSE = (1/N) * sum((y_i - y_hat_i)^2). The objective of training is to minimize this loss function across all training examples.",
    },
    {
      pageNumber: 3,
      section: "Section 1.3: Backpropagation & Optimization",
      documentName: "Introduction_to_Neural_Networks.txt",
      text: "Backpropagation calculates the gradient of the loss function with respect to every weight in the network by applying the chain rule of calculus backwards from the output layer to the input layer. The weights are then updated using an optimization algorithm such as Stochastic Gradient Descent (SGD): w = w - eta * (dL/dw), where eta is the learning rate. Modern optimizers like Adam (Adaptive Moment Estimation) incorporate running averages of both gradients (first moment) and squared gradients (second moment) to accelerate convergence and navigate saddle points effectively.",
    },
  ],
};

const TEACHER_QUICK_CHIPS = [
  "Teach me this chapter step by step",
  "Explain this concept in simple words",
  "Explain it with a real-world analogy",
  "What are the most important exam questions?",
  "Give me a step-by-step mathematical example",
  "Ask me a question to test my understanding",
  "Explain this again more simply",
];

let globalEventCounter = 0;
function getNextUniqueId(prefix: string): string {
  globalEventCounter += 1;
  return `${prefix}-${globalEventCounter}`;
}

export function StudyStudio() {
  const { user } = useAuth();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceTab>("materials");
  const [materials, setMaterials] = useState<StudyMaterial[]>([SAMPLE_MATERIAL]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([SAMPLE_MATERIAL.id]);
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [consent, setConsent] = useState(true);

  // AI Teacher Chat State
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [teacherThinking, setTeacherThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Exam Prep State
  const [examMarks, setExamMarks] = useState<2 | 5 | 10>(5);
  const [examFormat, setExamFormat] = useState("All Formats");
  const [examQuestionCount, setExamCount] = useState(3);
  const [examDifficulty, setExamDifficulty] = useState<"standard" | "challenging">("standard");
  const [examGenerating, setExamGenerating] = useState(false);
  const [examResult, setExamResult] = useState<string | null>(null);

  // Interactive Quiz State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizGenerating, setQuizGenerating] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Array<{ questionId: number; selectedOption: number; isCorrect: boolean }>>([]);
  const [quizComplete, setQuizComplete] = useState(false);

  // Answer Evaluation State
  const [evalQuestion, setEvalQuestion] = useState("");
  const [evalAnswer, setEvalAnswer] = useState("");
  const [evalMarks, setEvalMarks] = useState<2 | 5 | 10>(5);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<AnswerEvaluation | null>(null);

  // Flashcards State
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [flashcardsGenerating, setFlashcardsGenerating] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState<Set<number>>(new Set());
  const [needsReviewCards, setNeedsReviewCards] = useState<Set<number>>(new Set());

  // Revision & Weak Topics State
  const [weakTopics, setWeakTopics] = useState<WeakTopicItem[]>([]);
  const [revisionPlan, setRevisionPlan] = useState<string | null>(null);
  const [revisionGenerating, setRevisionGenerating] = useState(false);

  // Shared status/error notification
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [directKeyInput, setDirectKeyInput] = useState<string>("");

  // Multi-Provider Fallback Engine Result Tracking
  const [activeProviderResult, setActiveProviderResult] = useState<{
    provider: string;
    providerLabel: string;
    model: string;
    fallbackOccurred: boolean;
    fallbackChain?: string[];
  } | null>(null);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, teacherThinking]);

  // Total active passages & character count
  const activeMaterials = materials.filter((m) => selectedMaterialIds.includes(m.id));
  const activePassageCount = activeMaterials.reduce((acc, m) => acc + m.passages.length, 0);
  const activeCharCount = activeMaterials.reduce((acc, m) => acc + m.totalChars, 0);

  // Helper to toggle material selection
  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAllMaterials = () => {
    setSelectedMaterialIds(materials.map((m) => m.id));
  };

  const removeMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
    setSelectedMaterialIds((prev) => prev.filter((i) => i !== id));
  };

  // ─────────────────────────────────────────────────────────────
  // FILE UPLOAD & EXTRACTION HANDLER
  // ─────────────────────────────────────────────────────────────
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setExtractionError(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        setExtractionProgress({
          stage: "reading",
          current: i + 1,
          total: files.length,
          percent: Math.round(((i + 0.1) / files.length) * 100),
          message: `Reading ${file.name}...`,
        });

        const extracted = await extractStudyMaterial(file, {
          onProgress: (p) => {
            setExtractionProgress(p);
          },
        });

        setMaterials((prev) => {
          // Deduplicate by ID
          const existing = prev.findIndex((m) => m.id === extracted.id || m.name === extracted.name);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = extracted;
            return next;
          }
          return [...prev, extracted];
        });

        setSelectedMaterialIds((prev) =>
          prev.includes(extracted.id) ? prev : [...prev, extracted.id]
        );
      } catch (err) {
        setExtractionError((err as Error)?.message || `Failed to process ${file.name}`);
      }
    }

    setExtractionProgress(null);
  };

  // ─────────────────────────────────────────────────────────────
  // CORE API CALL HELPER
  // ─────────────────────────────────────────────────────────────
  const executeStudyRequest = async (
    task: StudyTask,
    options: {
      question?: string;
      userAnswer?: string;
      targetMarks?: 2 | 5 | 10;
      examFormat?: string;
      difficulty?: "standard" | "challenging";
      questionCount?: number;
      history?: Array<{ role: "user" | "model"; text: string }>;
    } = {}
  ) => {
    if (!consent) {
      throw new Error("Explicit privacy consent is required before study text can be processed by Gemini.");
    }

    if (activeMaterials.length === 0) {
      throw new Error("Please upload or select at least one study material.");
    }

    // Retrieve grounded context
    const context = buildGroundedContext(materials, {
      materialIds: selectedMaterialIds,
      query: options.question,
      maxCharacters: 24_000,
    });

    if (!context.isSufficient) {
      throw new Error("Selected study materials do not contain sufficient text for this task.");
    }

    // Passages array formatted for server
    const passages = activeMaterials.flatMap((m) =>
      m.passages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        section: p.section,
        documentName: m.name,
      }))
    );

    const syntheticKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const token = user ? await user.getIdToken() : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const clientKey = typeof window !== "undefined" ? localStorage.getItem("noctra_custom_gemini_key") : null;
    if (clientKey && clientKey.trim()) {
      headers["x-gemini-api-key"] = clientKey.trim();
    }

    const payload = {
      documentKey: syntheticKey,
      task,
      question: options.question,
      userAnswer: options.userAnswer,
      targetMarks: options.targetMarks,
      examFormat: options.examFormat,
      difficulty: options.difficulty,
      questionCount: options.questionCount,
      passages: passages.slice(0, 50), // Safe chunk budget
      history: options.history,
      consent: true,
    };

    const res = await fetch("/api/study", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Study assistant could not complete this request.");
    }

    if (data.provider) {
      setActiveProviderResult({
        provider: data.provider,
        providerLabel: data.providerLabel || data.provider,
        model: data.model,
        fallbackOccurred: Boolean(data.fallbackOccurred),
        fallbackChain: data.fallbackChain,
      });
    }

    return data;
  };

  // ─────────────────────────────────────────────────────────────
  // WORKSPACE 2: AI TEACHER CHAT
  // ─────────────────────────────────────────────────────────────
  const handleTeacherSend = async (messageText: string) => {
    const text = messageText.trim();
    if (!text || teacherThinking) return;

    const userMessage: ChatMessageItem = {
      id: getNextUniqueId("user"),
      role: "user",
      text,
      timestamp: 0,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setTeacherThinking(true);
    setStatusMessage(null);

    try {
      // Build conversation history for context
      const history = chatMessages.slice(-6).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const response = await executeStudyRequest("teacher-chat", {
        question: text,
        history,
      });

      const modelMessage: ChatMessageItem = {
        id: getNextUniqueId("model"),
        role: "model",
        text: response.answer,
        timestamp: 0,
        sources: response.sourceDocs,
      };

      setChatMessages((prev) => [...prev, modelMessage]);
    } catch (err) {
      setStatusMessage((err as Error)?.message || "Failed to reach AI Teacher.");
    } finally {
      setTeacherThinking(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WORKSPACE 3: EXAM PREPARATION
  // ─────────────────────────────────────────────────────────────
  const handleGenerateExamQuestions = async () => {
    setExamGenerating(true);
    setExamResult(null);
    setStatusMessage(null);

    try {
      const response = await executeStudyRequest("exam-questions", {
        targetMarks: examMarks,
        examFormat,
        difficulty: examDifficulty,
        questionCount: examQuestionCount,
        question: `Generate ${examMarks}-mark examination questions with marking schemes and model answers.`,
      });

      setExamResult(response.answer);
    } catch (err) {
      setStatusMessage((err as Error)?.message || "Failed to generate examination questions.");
    } finally {
      setExamGenerating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WORKSPACE 4: INTERACTIVE PRACTICE QUIZ
  // ─────────────────────────────────────────────────────────────
  const handleGenerateQuiz = async () => {
    setQuizGenerating(true);
    setStatusMessage(null);
    setQuizQuestions([]);
    setCurrentQuizIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setQuizScore(0);
    setQuizAnswers([]);
    setQuizComplete(false);

    try {
      const response = await executeStudyRequest("quiz", {
        questionCount: 5,
        question: "Generate an interactive 5-question multiple choice quiz testing core concepts.",
      });

      if (response.quiz && response.quiz.length > 0) {
        setQuizQuestions(response.quiz);
      } else {
        // Fallback: parse quiz from response answer
        throw new Error("Quiz could not be formatted into interactive questions. Please try again.");
      }
    } catch (err) {
      setStatusMessage((err as Error)?.message || "Failed to generate practice quiz.");
    } finally {
      setQuizGenerating(false);
    }
  };

  const handleSelectQuizOption = (index: number) => {
    if (isAnswerSubmitted) return;
    setSelectedOption(index);
  };

  const handleSubmitQuizAnswer = () => {
    if (selectedOption === null || isAnswerSubmitted) return;
    const currentQ = quizQuestions[currentQuizIndex];
    const isCorrect = selectedOption === currentQ.correctIndex;

    setIsAnswerSubmitted(true);
    if (isCorrect) {
      setQuizScore((prev) => prev + 1);
    } else {
      // Record as weak topic
      setWeakTopics((prev) => [
        ...prev,
        {
          id: getNextUniqueId("weak"),
          topic: currentQ.question.slice(0, 60),
          sourceDoc: currentQ.sourceReference || activeMaterials[0]?.name || "Study Document",
          identifiedFrom: "quiz",
          timestamp: 0,
        },
      ]);
    }

    setQuizAnswers((prev) => [
      ...prev,
      {
        questionId: currentQ.id,
        selectedOption,
        isCorrect,
      },
    ]);
  };

  const handleNextQuizQuestion = () => {
    if (currentQuizIndex + 1 < quizQuestions.length) {
      setCurrentQuizIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
    } else {
      setQuizComplete(true);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WORKSPACE 5: ACTIVE RECALL FLASHCARDS
  // ─────────────────────────────────────────────────────────────
  const handleGenerateFlashcards = async () => {
    setFlashcardsGenerating(true);
    setStatusMessage(null);
    setFlashcards([]);
    setCardIndex(0);
    setIsFlipped(false);
    setMasteredCards(new Set());
    setNeedsReviewCards(new Set());

    try {
      const response = await executeStudyRequest("flashcards", {
        questionCount: 8,
        question: "Generate 8 high-yield active recall flashcards covering key definitions and formulas.",
      });

      if (response.flashcards && response.flashcards.length > 0) {
        setFlashcards(response.flashcards);
      } else {
        throw new Error("Flashcards could not be parsed into interactive cards. Please try again.");
      }
    } catch (err) {
      setStatusMessage((err as Error)?.message || "Failed to generate flashcards.");
    } finally {
      setFlashcardsGenerating(false);
    }
  };

  const markCardMastered = (id: number) => {
    setMasteredCards((prev) => new Set(prev).add(id));
    setNeedsReviewCards((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (cardIndex + 1 < flashcards.length) {
      setCardIndex((prev) => prev + 1);
      setIsFlipped(false);
    }
  };

  const markCardNeedsReview = (id: number) => {
    setNeedsReviewCards((prev) => new Set(prev).add(id));
    setMasteredCards((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    const currentCard = flashcards[cardIndex];
    if (currentCard) {
      setWeakTopics((prev) => [
        ...prev,
        {
          id: getNextUniqueId("weak"),
          topic: currentCard.front,
          sourceDoc: currentCard.sourceReference || activeMaterials[0]?.name || "Study Material",
          identifiedFrom: "flashcard",
          timestamp: 0,
        },
      ]);
    }

    if (cardIndex + 1 < flashcards.length) {
      setCardIndex((prev) => prev + 1);
      setIsFlipped(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WORKSPACE: ANSWER EVALUATION (from Exam Prep)
  // ─────────────────────────────────────────────────────────────
  const handleEvaluateAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!evalQuestion.trim() || !evalAnswer.trim() || evaluating) return;

    setEvaluating(true);
    setEvaluationResult(null);
    setStatusMessage(null);

    try {
      const response = await executeStudyRequest("evaluate-answer", {
        question: evalQuestion,
        userAnswer: evalAnswer,
        targetMarks: evalMarks,
      });

      if (response.evaluation) {
        setEvaluationResult(response.evaluation);
        if (response.evaluation.marksAwarded < evalMarks * 0.6) {
          setWeakTopics((prev) => [
            ...prev,
            {
              id: getNextUniqueId("weak"),
              topic: evalQuestion.slice(0, 60),
              sourceDoc: activeMaterials[0]?.name || "Study Material",
              identifiedFrom: "evaluation",
              timestamp: 0,
            },
          ]);
        }
      } else {
        throw new Error("Evaluation could not be structured. Please try again.");
      }
    } catch (err) {
      setStatusMessage((err as Error)?.message || "Failed to evaluate answer.");
    } finally {
      setEvaluating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // WORKSPACE 6: REVISION & WEAK TOPICS
  // ─────────────────────────────────────────────────────────────
  const handleGenerateRevisionPlan = async () => {
    setRevisionGenerating(true);
    setStatusMessage(null);
    try {
      const response = await executeStudyRequest("revision-plan", {
        question: "Generate a personalized spaced-repetition revision schedule prioritizing student retention.",
      });
      setRevisionPlan(response.answer);
    } catch (err) {
      setStatusMessage((err as Error)?.message || "Failed to generate revision schedule.");
    } finally {
      setRevisionGenerating(false);
    }
  };

  return (
    <div className="study-platform-root">
      {/* ── Top Workspace Tab Navigation ── */}
      <nav className="study-workspace-nav" aria-label="Study AI Workspaces">
        <button
          type="button"
          onClick={() => setActiveWorkspace("materials")}
          className={`study-nav-btn ${activeWorkspace === "materials" ? "is-active" : ""}`}
        >
          <span className="study-nav-icon">📚</span>
          <span className="study-nav-text">Study Materials</span>
          <span className="study-nav-count">{materials.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspace("teacher")}
          className={`study-nav-btn ${activeWorkspace === "teacher" ? "is-active" : ""}`}
        >
          <span className="study-nav-icon">🧑‍🏫</span>
          <span className="study-nav-text">AI Teacher</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspace("exam")}
          className={`study-nav-btn ${activeWorkspace === "exam" ? "is-active" : ""}`}
        >
          <span className="study-nav-icon">📝</span>
          <span className="study-nav-text">Exam Preparation</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspace("quiz")}
          className={`study-nav-btn ${activeWorkspace === "quiz" ? "is-active" : ""}`}
        >
          <span className="study-nav-icon">🎯</span>
          <span className="study-nav-text">Practice Quiz</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspace("flashcards")}
          className={`study-nav-btn ${activeWorkspace === "flashcards" ? "is-active" : ""}`}
        >
          <span className="study-nav-icon">🃏</span>
          <span className="study-nav-text">Flashcards</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkspace("revision")}
          className={`study-nav-btn ${activeWorkspace === "revision" ? "is-active" : ""}`}
        >
          <span className="study-nav-icon">📈</span>
          <span className="study-nav-text">Revision &amp; Weak Topics</span>
          {weakTopics.length > 0 && <span className="study-nav-alert">{weakTopics.length}</span>}
        </button>
      </nav>

      {/* ── Active Grounding Ribbon & Multi-Provider Engine Status ── */}
      <div className="study-grounding-bar">
        <div className="grounding-info">
          <span className="grounding-badge">Active Materials</span>
          <span className="grounding-meta">
            {activeMaterials.length} file{activeMaterials.length === 1 ? "" : "s"} selected · {activePassageCount} passages ({activeCharCount.toLocaleString()} chars)
          </span>
        </div>

        <div className="grounding-right-cluster">
          {activeProviderResult ? (
            <div
              className={`provider-badge ${activeProviderResult.fallbackOccurred ? "is-fallback" : "is-primary"}`}
              title={
                activeProviderResult.fallbackOccurred
                  ? `Sequential fallback: ${activeProviderResult.fallbackChain?.join(" → ")}`
                  : `Fulfilled directly by ${activeProviderResult.providerLabel} (${activeProviderResult.model})`
              }
            >
              <span className="provider-badge-icon" aria-hidden="true">
                {activeProviderResult.fallbackOccurred ? "🔄" : "⚡"}
              </span>
              <span className="provider-badge-text">
                {activeProviderResult.fallbackOccurred
                  ? `Gemini Primary unavailable — using ${activeProviderResult.providerLabel}`
                  : `Generated with ${activeProviderResult.providerLabel}`}
              </span>
              <span className="provider-badge-model">({activeProviderResult.model})</span>
            </div>
          ) : (
            <div className="provider-badge is-standby" title="Sequential fallback engine active: Gemini Primary → Gemini Secondary → OpenRouter Free">
              <span className="provider-badge-icon" aria-hidden="true">🛡️</span>
              <span className="provider-badge-text">3-Tier AI Fallback Engine Active</span>
            </div>
          )}

          <div className="grounding-privacy">
            <span className="grounding-lock-icon" aria-hidden="true">🔒</span>
            <span>Processed locally in browser</span>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div role="alert" className="study-global-error" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "stretch" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
            <span>{statusMessage}</span>
            <button type="button" onClick={() => setStatusMessage(null)} className="error-close-btn" aria-label="Dismiss message">✕</button>
          </div>
          {statusMessage.toLowerCase().includes("gemini_api_key") && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", paddingTop: "4px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <input
                type="password"
                placeholder="Or paste Gemini API key directly (AQ... / AIza...)"
                value={directKeyInput}
                onChange={(e) => setDirectKeyInput(e.target.value)}
                style={{
                  flex: "1 1 260px",
                  background: "rgba(0,0,0,0.6)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "6px",
                  padding: "7px 12px",
                  color: "#fff",
                  fontSize: "13px",
                  outline: "none"
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const cleaned = directKeyInput.trim().replace(/^["']|["']$/g, "").trim();
                  if (cleaned) {
                    localStorage.setItem("noctra_custom_gemini_key", cleaned);
                    setStatusMessage(null);
                    setDirectKeyInput("");
                  }
                }}
                style={{
                  background: "var(--accent-purple, #a855f7)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "7px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Save &amp; Connect Key
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
         WORKSPACE 1: STUDY MATERIALS
         ══════════════════════════════════════════════════════════════ */}
      {activeWorkspace === "materials" && (
        <div className="workspace-view materials-view">
          <div className="materials-upload-card">
            <h2 className="workspace-heading">Upload Study Materials</h2>
            <p className="workspace-sub">
              Upload your lecture notes, textbook chapters, or presentation slides. Supported formats: <strong>PDF</strong>, <strong>DOCX</strong>, <strong>PPTX</strong>, and <strong>TXT</strong>.
            </p>

            <label className="study-drop-zone">
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.txt,.md"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="sr-only"
              />
              <div className="drop-content">
                <svg className="drop-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="drop-main-text">
                  Drag and drop files here, or <span className="browse-link">browse to upload</span>
                </p>
                <p className="drop-sub-text">Max 50MB per file · Pure client-side parsing</p>
              </div>
            </label>

            <div className="study-consent-row">
              <label className="study-consent-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="study-consent-checkbox"
                />
                <span>I consent to sending extracted study passages to the AI provider for analysis.</span>
              </label>
            </div>

            {extractionProgress && (
              <div className="extraction-progress-box">
                <div className="progress-label-row">
                  <span>{extractionProgress.message}</span>
                  <span>{extractionProgress.percent}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${extractionProgress.percent}%` }} />
                </div>
              </div>
            )}

            {extractionError && (
              <div role="alert" className="extraction-error-box">
                ⚠️ {extractionError}
              </div>
            )}
          </div>

          <div className="materials-list-card">
            <div className="materials-header-row">
              <h3 className="materials-list-title">
                Your Study Library ({materials.length})
              </h3>
              <div className="materials-actions">
                <button
                  type="button"
                  onClick={selectAllMaterials}
                  className="materials-select-all-btn"
                >
                  Select All
                </button>
              </div>
            </div>

            <div className="materials-grid">
              {materials.map((mat) => {
                const isSelected = selectedMaterialIds.includes(mat.id);
                return (
                  <div
                    key={mat.id}
                    className={`material-item-card ${isSelected ? "is-selected" : ""}`}
                  >
                    <div className="material-item-top">
                      <label className="material-checkbox-label">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMaterialSelection(mat.id)}
                          className="material-checkbox"
                        />
                        <span className={`material-type-pill type-${mat.type}`}>
                          {mat.type.toUpperCase()}
                        </span>
                        <span className="material-name" title={mat.name}>
                          {mat.name}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => removeMaterial(mat.id)}
                        className="material-remove-btn"
                        title="Remove file"
                        aria-label={`Remove ${mat.name}`}
                      >
                        ✕
                      </button>
                    </div>

                    <p className="material-snippet">{mat.previewSnippet}</p>

                    <div className="material-meta-row">
                      <span>{mat.pageCount} {mat.type === "pptx" ? "slides" : "pages"}</span>
                      <span>·</span>
                      <span>{mat.totalChars.toLocaleString()} characters</span>
                      <span>·</span>
                      <span>{mat.subject}</span>
                    </div>

                    {mat.isScanned && (
                      <div className="material-scanned-alert">
                        ⚠️ Zero selectable text detected. This file appears to be a scanned image-only PDF.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
         WORKSPACE 2: AI TEACHER
         ══════════════════════════════════════════════════════════════ */}
      {activeWorkspace === "teacher" && (
        <div className="workspace-view teacher-view">
          <div className="teacher-chat-card">
            <div className="teacher-header">
              <div className="teacher-avatar">🧑‍🏫</div>
              <div className="teacher-title-block">
                <h2 className="teacher-title">Noctra AI Teacher</h2>
                <p className="teacher-status">
                  Teaching from {activeMaterials.length} selected document{activeMaterials.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatMessages([])}
                className="chat-clear-btn"
              >
                Clear Conversation
              </button>
            </div>

            {/* Chat message history */}
            <div className="chat-messages-container">
              {chatMessages.length === 0 ? (
                <div className="teacher-intro-state">
                  <div className="intro-icon">💡</div>
                  <h3 className="intro-title">Welcome to your Personal AI Tutor</h3>
                  <p className="intro-desc">
                    Ask me to explain any chapter, deconstruct complex equations, provide real-world analogies, or test your understanding. All answers are strictly grounded in your uploaded materials.
                  </p>
                  <div className="quick-chips-grid">
                    {TEACHER_QUICK_CHIPS.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleTeacherSend(chip)}
                        className="quick-chip-btn"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`chat-bubble-row ${msg.role === "user" ? "user-row" : "teacher-row"}`}
                  >
                    <div className="chat-bubble">
                      <div className="bubble-sender">
                        {msg.role === "user" ? "You (Student)" : "Noctra AI Teacher"}
                      </div>
                      <div className="bubble-content whitespace-pre-wrap">
                        {msg.text}
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="bubble-sources">
                          <span className="source-label">Sources:</span>
                          {msg.sources.map((s, i) => (
                            <span key={i} className="source-tag">{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {teacherThinking && (
                <div className="chat-bubble-row teacher-row">
                  <div className="chat-bubble thinking-bubble">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-text">Reviewing your study materials...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick chips when conversation is active */}
            {chatMessages.length > 0 && (
              <div className="active-chips-scroll">
                {TEACHER_QUICK_CHIPS.slice(0, 4).map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTeacherSend(chip)}
                    className="small-quick-chip"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Input bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleTeacherSend(chatInput);
              }}
              className="chat-input-bar"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask your AI teacher (e.g. 'Explain Newton's second law step by step')..."
                className="chat-input"
                disabled={teacherThinking}
              />
              <button
                type="submit"
                disabled={teacherThinking || !chatInput.trim()}
                className="chat-send-btn"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
         WORKSPACE 3: EXAM PREPARATION
         ══════════════════════════════════════════════════════════════ */}
      {activeWorkspace === "exam" && (
        <div className="workspace-view exam-view">
          <div className="exam-controls-card">
            <h2 className="workspace-heading">Exam Question Generator</h2>
            <p className="workspace-sub">
              Generate genuine 2-mark, 5-mark, and 10-mark examination questions with marking schemes and complete model answers.
            </p>

            <div className="exam-settings-grid">
              <div className="setting-field">
                <label className="setting-label">Mark Weightage</label>
                <div className="marks-toggle-group">
                  <button
                    type="button"
                    onClick={() => setExamMarks(2)}
                    className={`mark-btn ${examMarks === 2 ? "is-active" : ""}`}
                  >
                    2 Marks (Short)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamMarks(5)}
                    className={`mark-btn ${examMarks === 5 ? "is-active" : ""}`}
                  >
                    5 Marks (Medium)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamMarks(10)}
                    className={`mark-btn ${examMarks === 10 ? "is-active" : ""}`}
                  >
                    10 Marks (Essay)
                  </button>
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">Question Format</label>
                <div className="marks-toggle-group">
                  {["All Formats", "Descriptive", "Conceptual"].map((fmt) => (
                    <button
                      type="button"
                      key={fmt}
                      onClick={() => setExamFormat(fmt)}
                      className={`mark-btn ${examFormat === fmt ? "is-active" : ""}`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">Question Count</label>
                <div className="marks-toggle-group">
                  {[3, 5, 10].map((cnt) => (
                    <button
                      type="button"
                      key={cnt}
                      onClick={() => setExamCount(cnt)}
                      className={`mark-btn ${examQuestionCount === cnt ? "is-active" : ""}`}
                    >
                      {cnt} Questions
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting-field">
                <label className="setting-label">Difficulty</label>
                <div className="marks-toggle-group">
                  <button
                    type="button"
                    onClick={() => setExamDifficulty("standard")}
                    className={`mark-btn ${examDifficulty === "standard" ? "is-active" : ""}`}
                  >
                    Standard Exam
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamDifficulty("challenging")}
                    className={`mark-btn ${examDifficulty === "challenging" ? "is-active" : ""}`}
                  >
                    Challenging
                  </button>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateExamQuestions}
              disabled={examGenerating || activeMaterials.length === 0}
              className="generate-exam-btn noctra-btn-primary"
            >
              {examGenerating ? "Synthesizing Exam Paper..." : `Generate ${examMarks}-Mark Exam Questions`}
            </button>
          </div>

          {/* Exam output */}
          {examResult && (
            <div className="exam-results-card">
              <div className="exam-results-header">
                <h3 className="exam-results-title">Generated Examination Questions</h3>
                <span className="exam-badge">{examMarks} Marks Category</span>
              </div>
              <div className="exam-markdown-body whitespace-pre-wrap">
                {examResult}
              </div>
            </div>
          )}

          {/* Answer Evaluation Section */}
          <div className="answer-eval-card">
            <h3 className="eval-heading">Test &amp; Evaluate Your Written Answer</h3>
            <p className="eval-sub">
              Type or paste your answer to any question. Noctra AI will evaluate it against the study material and score it with detailed feedback.
            </p>

            <form onSubmit={handleEvaluateAnswer} className="eval-form">
              <div className="eval-field">
                <label className="eval-label">Exam Question</label>
                <input
                  type="text"
                  value={evalQuestion}
                  onChange={(e) => setEvalQuestion(e.target.value)}
                  placeholder="Paste or enter the question you answered..."
                  className="eval-input"
                />
              </div>

              <div className="eval-field">
                <div className="eval-field-header">
                  <label className="eval-label">Your Written Answer</label>
                  <div className="eval-marks-picker">
                    <span className="marks-picker-label">Max Marks:</span>
                    {[2, 5, 10].map((m) => (
                      <button
                        type="button"
                        key={m}
                        onClick={() => setEvalMarks(m as 2 | 5 | 10)}
                        className={`picker-pill ${evalMarks === m ? "is-active" : ""}`}
                      >
                        {m}M
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={evalAnswer}
                  onChange={(e) => setEvalAnswer(e.target.value)}
                  placeholder="Type your exam answer here as you would write it in your exam paper..."
                  className="eval-textarea"
                />
              </div>

              <button
                type="submit"
                disabled={evaluating || !evalQuestion.trim() || !evalAnswer.trim()}
                className="eval-submit-btn noctra-btn-secondary"
              >
                {evaluating ? "Grading Against Study Material..." : `Evaluate Answer (${evalMarks} Marks)`}
              </button>
            </form>

            {evaluationResult && (
              <div className="evaluation-report-box">
                <div className="eval-score-banner">
                  <div className="score-dial">
                    <span className="score-val">{evaluationResult.marksAwarded}</span>
                    <span className="score-total">/ {evaluationResult.maxMarks}</span>
                  </div>
                  <div className="score-summary">
                    <h4 className="score-title">
                      {evaluationResult.percentage >= 80
                        ? "Excellent Answer"
                        : evaluationResult.percentage >= 50
                        ? "Good Attempt — Revisions Needed"
                        : "Needs Conceptual Revision"}
                    </h4>
                    <p className="score-feedback">{evaluationResult.feedback}</p>
                    <p className="score-disclaimer">
                      * AI evaluation is a formative study guide and does not constitute an official academic examination grade.
                    </p>
                  </div>
                </div>

                <div className="eval-breakdown-grid">
                  <div className="eval-col col-covered">
                    <h5>✓ Key Concepts Awarded</h5>
                    <ul>
                      {evaluationResult.keyPointsCovered.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="eval-col col-missing">
                    <h5>✕ Missing Concepts / Gaps</h5>
                    <ul>
                      {evaluationResult.missingConcepts.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="model-answer-section">
                  <h5>🌟 Model 100% Exam Answer:</h5>
                  <div className="model-answer-text">{evaluationResult.modelAnswer}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
         WORKSPACE 4: INTERACTIVE PRACTICE QUIZ
         ══════════════════════════════════════════════════════════════ */}
      {activeWorkspace === "quiz" && (
        <div className="workspace-view quiz-view">
          {quizQuestions.length === 0 ? (
            <div className="quiz-start-card">
              <div className="quiz-start-icon">🎯</div>
              <h2 className="quiz-start-title">Interactive MCQ Practice Quiz</h2>
              <p className="quiz-start-desc">
                Test your mastery with 5 multiple-choice questions grounded in your selected study materials. One question at a time with instant answer feedback and explanations.
              </p>
              <button
                type="button"
                onClick={handleGenerateQuiz}
                disabled={quizGenerating || activeMaterials.length === 0}
                className="quiz-launch-btn noctra-btn-primary"
              >
                {quizGenerating ? "Generating Quiz Questions..." : "Start Practice Quiz (5 Questions)"}
              </button>
            </div>
          ) : !quizComplete ? (
            <div className="quiz-runner-card">
              {/* Progress bar */}
              <div className="quiz-progress-bar-row">
                <span className="quiz-step-label">
                  Question {currentQuizIndex + 1} of {quizQuestions.length}
                </span>
                <span className="quiz-score-badge">Score: {quizScore}</span>
              </div>
              <div className="quiz-track">
                <div
                  className="quiz-fill"
                  style={{ width: `${((currentQuizIndex + 1) / quizQuestions.length) * 100}%` }}
                />
              </div>

              {/* Question stem */}
              <h3 className="quiz-question-stem">
                {quizQuestions[currentQuizIndex]?.question}
              </h3>

              {/* Options */}
              <div className="quiz-options-group">
                {quizQuestions[currentQuizIndex]?.options.map((opt, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === quizQuestions[currentQuizIndex].correctIndex;
                  let optionClass = "quiz-option-btn";
                  if (isSelected) optionClass += " is-selected";
                  if (isAnswerSubmitted) {
                    if (isCorrect) optionClass += " is-correct-answer";
                    else if (isSelected && !isCorrect) optionClass += " is-wrong-answer";
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectQuizOption(idx)}
                      disabled={isAnswerSubmitted}
                      className={optionClass}
                    >
                      <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                      <span className="option-text">{opt}</span>
                    </button>
                  );
                })}
              </div>

              {/* Immediate feedback & explanation */}
              {isAnswerSubmitted && (
                <div className="quiz-explanation-box">
                  <div className="explanation-status">
                    {selectedOption === quizQuestions[currentQuizIndex].correctIndex ? (
                      <span className="ans-correct">✓ Correct Answer!</span>
                    ) : (
                      <span className="ans-incorrect">✕ Incorrect</span>
                    )}
                  </div>
                  <p className="explanation-text">
                    {quizQuestions[currentQuizIndex].explanation}
                  </p>
                  {quizQuestions[currentQuizIndex].sourceReference && (
                    <p className="explanation-citation">
                      Source: {quizQuestions[currentQuizIndex].sourceReference}
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="quiz-action-bar">
                {!isAnswerSubmitted ? (
                  <button
                    type="button"
                    onClick={handleSubmitQuizAnswer}
                    disabled={selectedOption === null}
                    className="quiz-submit-btn noctra-btn-primary"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextQuizQuestion}
                    className="quiz-next-btn noctra-btn-primary"
                  >
                    {currentQuizIndex + 1 < quizQuestions.length ? "Next Question →" : "View Final Score"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="quiz-summary-card">
              <div className="summary-icon">🏆</div>
              <h2 className="summary-heading">Quiz Completed!</h2>
              <div className="summary-score-dial">
                <span className="summary-num">{quizScore}</span>
                <span className="summary-den">/ {quizQuestions.length}</span>
              </div>
              <p className="summary-percentage">
                Mastery Score: {Math.round((quizScore / quizQuestions.length) * 100)}%
              </p>
              {weakTopics.length > 0 && (
                <p className="summary-weak-note">
                  {weakTopics.length} missed topic{weakTopics.length === 1 ? "" : "s"} added to your Revision Schedule.
                </p>
              )}

              {quizAnswers.length > 0 && (
                <div className="quiz-answers-review-list">
                  {quizAnswers.map((ans, idx) => (
                    <div key={idx} className={`review-pill ${ans.isCorrect ? "is-correct" : "is-wrong"}`}>
                      <span>Q{idx + 1}: {ans.isCorrect ? "✓ Correct" : "✕ Incorrect"}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="summary-btn-group">
                <button
                  type="button"
                  onClick={handleGenerateQuiz}
                  className="noctra-btn-primary"
                >
                  Generate New Quiz
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWorkspace("revision")}
                  className="noctra-btn-secondary"
                >
                  View Revision Topics
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
         WORKSPACE 5: ACTIVE RECALL FLASHCARDS
         ══════════════════════════════════════════════════════════════ */}
      {activeWorkspace === "flashcards" && (
        <div className="workspace-view flashcards-view">
          {flashcards.length === 0 ? (
            <div className="flashcards-start-card">
              <div className="flashcard-icon">🃏</div>
              <h2 className="flashcard-start-title">Active Recall Flashcards</h2>
              <p className="flashcard-start-desc">
                Generate interactive flashcards from your study materials. Test your recall on definitions, formulas, and concepts.
              </p>
              <button
                type="button"
                onClick={handleGenerateFlashcards}
                disabled={flashcardsGenerating || activeMaterials.length === 0}
                className="flashcards-launch-btn noctra-btn-primary"
              >
                {flashcardsGenerating ? "Generating Flashcards..." : "Generate 8 Study Flashcards"}
              </button>
            </div>
          ) : (
            <div className="flashcards-runner-card">
              <div className="flashcard-top-row">
                <span className="card-counter">
                  Card {cardIndex + 1} of {flashcards.length}
                </span>
                <div className="card-mastery-pills">
                  <span className="mastery-pill pill-mastered">Mastered: {masteredCards.size}</span>
                  <span className="mastery-pill pill-review">Review: {needsReviewCards.size}</span>
                </div>
              </div>

              {/* 3D Flip Card */}
              <div
                className={`flashcard-scene ${isFlipped ? "is-flipped" : ""}`}
                onClick={() => setIsFlipped((prev) => !prev)}
                role="button"
                tabIndex={0}
                aria-label="Click to flip flashcard"
              >
                <div className="flashcard-inner">
                  <div className="flashcard-face flashcard-front">
                    <span className="card-side-tag">Question / Term</span>
                    <h3 className="card-front-text">{flashcards[cardIndex]?.front}</h3>
                    <span className="card-hint">Click card to reveal definition ↻</span>
                  </div>
                  <div className="flashcard-face flashcard-back">
                    <span className="card-side-tag">Answer / Definition</span>
                    <p className="card-back-text">{flashcards[cardIndex]?.back}</p>
                    {flashcards[cardIndex]?.sourceReference && (
                      <span className="card-source">{flashcards[cardIndex]?.sourceReference}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom controls */}
              <div className="flashcard-controls-row">
                <button
                  type="button"
                  onClick={() => markCardNeedsReview(flashcards[cardIndex]?.id)}
                  className="card-action-btn btn-needs-review"
                >
                  ✕ Needs Review
                </button>
                <button
                  type="button"
                  onClick={() => setIsFlipped((prev) => !prev)}
                  className="card-action-btn btn-flip"
                >
                  Flip Card
                </button>
                <button
                  type="button"
                  onClick={() => markCardMastered(flashcards[cardIndex]?.id)}
                  className="card-action-btn btn-got-it"
                >
                  ✓ Got It!
                </button>
              </div>

              {/* Step navigation */}
              <div className="card-nav-steps">
                <button
                  type="button"
                  disabled={cardIndex === 0}
                  onClick={() => {
                    setCardIndex((p) => p - 1);
                    setIsFlipped(false);
                  }}
                  className="card-step-arrow"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={cardIndex + 1 === flashcards.length}
                  onClick={() => {
                    setCardIndex((p) => p + 1);
                    setIsFlipped(false);
                  }}
                  className="card-step-arrow"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
         WORKSPACE 6: REVISION & WEAK TOPICS
         ══════════════════════════════════════════════════════════════ */}
      {activeWorkspace === "revision" && (
        <div className="workspace-view revision-view">
          <div className="revision-summary-card">
            <h2 className="workspace-heading">Revision Progress &amp; Weak Topics</h2>
            <p className="workspace-sub">
              Topics flagged during your quizzes, flashcard drills, and answer evaluations are compiled here to focus your revision.
            </p>

            <div className="weak-topics-box">
              <h3 className="section-subtitle">
                Priority Review Concepts ({weakTopics.length})
              </h3>
              {weakTopics.length === 0 ? (
                <div className="empty-weak-state">
                  <span>✨ No weak topics recorded yet! Take a practice quiz or review flashcards to identify concepts needing attention.</span>
                </div>
              ) : (
                <div className="weak-topics-list">
                  {weakTopics.map((item) => (
                    <div key={item.id} className="weak-topic-row">
                      <div className="weak-topic-info">
                        <span className="weak-topic-name">{item.topic}</span>
                        <span className="weak-topic-source">From {item.sourceDoc} ({item.identifiedFrom})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveWorkspace("teacher");
                          handleTeacherSend(`Teach me about "${item.topic}" in detail.`);
                        }}
                        className="weak-topic-teach-btn"
                      >
                        Teach Me This →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="revision-schedule-action">
              <button
                type="button"
                onClick={handleGenerateRevisionPlan}
                disabled={revisionGenerating || activeMaterials.length === 0}
                className="revision-gen-btn noctra-btn-primary"
              >
                {revisionGenerating ? "Designing Spaced-Repetition Plan..." : "Generate Personalized Revision Schedule"}
              </button>
            </div>

            {revisionPlan && (
              <div className="revision-plan-output">
                <h3 className="plan-title">Your Spaced-Repetition Schedule</h3>
                <div className="plan-body whitespace-pre-wrap">{revisionPlan}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Component Styles ── */}
      <style jsx>{`
        .study-platform-root {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ── Workspace Tabs Navigation ── */
        .study-workspace-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border-default);
          scrollbar-width: none;
        }
        .study-workspace-nav::-webkit-scrollbar {
          display: none;
        }
        .study-nav-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-family: var(--font-body);
          font-size: 0.8125rem;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
        }
        .study-nav-btn:hover {
          color: var(--text-primary);
          background: var(--bg-surface);
        }
        .study-nav-btn.is-active {
          color: #ffffff;
          background: var(--bg-elevated);
          border-color: var(--border-strong);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
        }
        .study-nav-icon {
          font-size: 1rem;
        }
        .study-nav-count {
          padding: 1px 6px;
          border-radius: var(--radius-pill);
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .study-nav-alert {
          padding: 1px 6px;
          border-radius: var(--radius-pill);
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          font-size: 0.6875rem;
          color: #fca5a5;
          font-weight: 700;
        }

        /* ── Active Grounding Ribbon ── */
        .study-grounding-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: 0.75rem;
        }
        .grounding-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .grounding-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: var(--radius-pill);
          background: rgba(124, 109, 255, 0.15);
          border: 1px solid rgba(124, 109, 255, 0.3);
          color: var(--accent-purple);
          font-weight: 700;
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .grounding-meta {
          color: var(--text-secondary);
        }
        .grounding-right-cluster {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .provider-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          transition: all 0.2s ease;
        }
        .provider-badge.is-primary {
          background: rgba(34, 197, 94, 0.12);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #86efac;
        }
        .provider-badge.is-fallback {
          background: rgba(234, 179, 8, 0.15);
          border: 1px solid rgba(234, 179, 8, 0.4);
          color: #fde047;
        }
        .provider-badge.is-standby {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          color: var(--text-secondary);
        }
        .provider-badge-icon {
          font-size: 0.75rem;
        }
        .provider-badge-model {
          font-family: monospace;
          font-size: 0.625rem;
          opacity: 0.85;
        }
        .grounding-privacy {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 0.6875rem;
        }

        .study-global-error {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-radius: var(--radius-md);
          color: #fca5a5;
          font-size: 0.8125rem;
        }
        .error-close-btn {
          background: transparent;
          border: none;
          color: #fca5a5;
          cursor: pointer;
          font-size: 1rem;
        }

        /* ── Common Workspace Styles ── */
        .workspace-view {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .workspace-heading {
          font-family: var(--font-heading);
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
        }
        .workspace-sub {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          margin-bottom: 18px;
          line-height: 1.5;
        }

        /* ── Workspace 1: Materials ── */
        .materials-upload-card,
        .materials-list-card {
          padding: 24px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
        }
        .study-drop-zone {
          display: block;
          border: 2px dashed var(--border-strong);
          border-radius: var(--radius-md);
          padding: 32px 20px;
          text-align: center;
          cursor: pointer;
          background: rgba(255, 255, 255, 0.01);
          transition: border-color var(--transition-fast), background var(--transition-fast);
        }
        .study-drop-zone:hover {
          border-color: var(--accent-purple);
          background: rgba(124, 109, 255, 0.04);
        }
        .drop-icon {
          width: 36px;
          height: 36px;
          margin: 0 auto 10px;
          color: var(--accent-purple);
        }
        .drop-main-text {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .browse-link {
          color: var(--accent-purple);
          text-decoration: underline;
        }
        .drop-sub-text {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .extraction-progress-box {
          margin-top: 16px;
          padding: 12px 14px;
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-default);
        }
        .progress-label-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .progress-track {
          height: 6px;
          background: var(--bg-page);
          border-radius: var(--radius-pill);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--accent-purple);
          transition: width 200ms ease;
        }
        .extraction-error-box {
          margin-top: 14px;
          padding: 10px 14px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          color: #fca5a5;
          font-size: 0.8125rem;
        }

        .materials-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .materials-list-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .materials-select-all-btn {
          font-size: 0.75rem;
          color: var(--accent-purple);
          background: transparent;
          border: none;
          cursor: pointer;
          font-weight: 600;
        }
        .materials-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        @media (min-width: 768px) {
          .materials-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .material-item-card {
          padding: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 10px;
          transition: border-color var(--transition-fast);
        }
        .material-item-card.is-selected {
          border-color: var(--accent-purple);
          box-shadow: 0 0 0 1px var(--accent-purple);
        }
        .material-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .material-checkbox-label {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          overflow: hidden;
        }
        .material-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .material-type-pill {
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          font-size: 0.625rem;
          font-weight: 700;
          background: var(--bg-page);
          border: 1px solid var(--border-strong);
        }
        .type-pdf { color: #f87171; }
        .type-docx { color: #60a5fa; }
        .type-pptx { color: #fb923c; }
        .type-txt { color: #4ade80; }

        .material-remove-btn {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.8125rem;
          padding: 4px;
        }
        .material-remove-btn:hover {
          color: #ef4444;
        }
        .material-snippet {
          font-size: 0.75rem;
          color: var(--text-secondary);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .material-meta-row {
          display: flex;
          gap: 8px;
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .material-scanned-alert {
          padding: 6px 10px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: var(--radius-sm);
          color: #fbbf24;
          font-size: 0.6875rem;
        }

        /* ── Workspace 2: AI Teacher ── */
        .teacher-chat-card {
          display: flex;
          flex-direction: column;
          height: 650px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .teacher-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: var(--bg-elevated);
          border-bottom: 1px solid var(--border-default);
        }
        .teacher-avatar {
          font-size: 1.6rem;
        }
        .teacher-title-block {
          flex: 1;
        }
        .teacher-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .teacher-status {
          font-size: 0.75rem;
          color: var(--accent-purple);
        }
        .chat-clear-btn {
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-size: 0.6875rem;
          padding: 4px 10px;
          cursor: pointer;
        }
        .chat-clear-btn:hover {
          color: var(--text-primary);
          background: var(--bg-surface);
        }
        .chat-messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .teacher-intro-state {
          margin: auto;
          text-align: center;
          max-width: 520px;
          padding: 30px 20px;
        }
        .intro-icon {
          font-size: 2.2rem;
          margin-bottom: 10px;
        }
        .intro-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .intro-desc {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 20px;
        }
        .quick-chips-grid {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
        }
        .quick-chip-btn {
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          color: var(--text-secondary);
          font-size: 0.75rem;
          padding: 6px 14px;
          cursor: pointer;
          transition: border-color var(--transition-fast), color var(--transition-fast);
        }
        .quick-chip-btn:hover {
          border-color: var(--accent-purple);
          color: var(--text-primary);
        }

        .chat-bubble-row {
          display: flex;
        }
        .chat-bubble-row.user-row {
          justify-content: flex-end;
        }
        .chat-bubble-row.teacher-row {
          justify-content: flex-start;
        }
        .chat-bubble {
          max-width: 82%;
          padding: 14px 18px;
          border-radius: 14px;
          font-size: 0.875rem;
          line-height: 1.6;
        }
        .user-row .chat-bubble {
          background: var(--accent-purple);
          color: #ffffff;
          border-bottom-right-radius: 2px;
        }
        .teacher-row .chat-bubble {
          background: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
          border-bottom-left-radius: 2px;
        }
        .bubble-sender {
          font-size: 0.6875rem;
          font-weight: 700;
          opacity: 0.7;
          margin-bottom: 4px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .bubble-sources {
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          font-size: 0.6875rem;
        }
        .source-label {
          color: var(--text-muted);
        }
        .source-tag {
          padding: 2px 6px;
          background: var(--bg-page);
          border-radius: var(--radius-sm);
          color: var(--accent-purple);
        }

        .thinking-bubble {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .thinking-dot {
          width: 6px;
          height: 6px;
          background: var(--accent-purple);
          border-radius: 50%;
          animation: pulse 1s infinite alternate;
        }
        .thinking-text {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          margin-left: 6px;
        }
        @keyframes pulse {
          0% { opacity: 0.3; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1.2); }
        }

        .active-chips-scroll {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding: 6px 16px;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-default);
        }
        .small-quick-chip {
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          color: var(--text-muted);
          font-size: 0.6875rem;
          padding: 3px 10px;
          white-space: nowrap;
          cursor: pointer;
        }
        .small-quick-chip:hover {
          color: var(--text-primary);
          border-color: var(--border-strong);
        }

        .chat-input-bar {
          display: flex;
          gap: 8px;
          padding: 14px 16px;
          background: var(--bg-elevated);
          border-top: 1px solid var(--border-default);
        }
        .chat-input {
          flex: 1;
          height: 42px;
          padding: 0 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 0.875rem;
          outline: none;
        }
        .chat-input:focus {
          border-color: var(--accent-purple);
        }
        .chat-send-btn {
          height: 42px;
          padding: 0 20px;
          background: var(--accent-purple);
          color: #ffffff;
          border: none;
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
        }
        .chat-send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ── Workspace 3: Exam Prep ── */
        .exam-controls-card,
        .exam-results-card,
        .answer-eval-card {
          padding: 24px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
        }
        .exam-settings-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }
        @media (min-width: 640px) {
          .exam-settings-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .setting-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-secondary);
          margin-bottom: 8px;
          display: block;
        }
        .marks-toggle-group {
          display: flex;
          gap: 6px;
        }
        .mark-btn {
          flex: 1;
          padding: 8px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .mark-btn.is-active {
          background: var(--accent-purple);
          color: #ffffff;
          border-color: var(--accent-purple);
        }
        .generate-exam-btn {
          width: 100%;
          height: 44px;
          font-weight: 600;
        }

        .exam-results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-default);
        }
        .exam-results-title {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .exam-badge {
          padding: 3px 8px;
          border-radius: var(--radius-pill);
          background: rgba(124, 109, 255, 0.15);
          color: var(--accent-purple);
          font-size: 0.6875rem;
          font-weight: 700;
        }
        .exam-markdown-body {
          font-size: 0.875rem;
          line-height: 1.7;
          color: var(--text-primary);
        }

        .eval-heading {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .eval-sub {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          margin-bottom: 18px;
        }
        .eval-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .eval-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .eval-field-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .eval-label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-secondary);
        }
        .eval-marks-picker {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .marks-picker-label {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .picker-pill {
          padding: 2px 8px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-pill);
          color: var(--text-secondary);
          font-size: 0.6875rem;
          cursor: pointer;
        }
        .picker-pill.is-active {
          background: var(--accent-purple);
          color: #ffffff;
          border-color: var(--accent-purple);
        }
        .eval-input {
          height: 40px;
          padding: 0 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 0.8125rem;
          outline: none;
        }
        .eval-textarea {
          padding: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 0.8125rem;
          line-height: 1.5;
          outline: none;
        }
        .eval-input:focus,
        .eval-textarea:focus {
          border-color: var(--accent-purple);
        }
        .eval-submit-btn {
          height: 40px;
          font-weight: 600;
        }

        .evaluation-report-box {
          margin-top: 24px;
          padding: 20px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .eval-score-banner {
          display: flex;
          align-items: center;
          gap: 18px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-default);
        }
        .score-dial {
          display: flex;
          align-items: baseline;
          padding: 10px 16px;
          background: var(--bg-page);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-md);
        }
        .score-val {
          font-size: 2rem;
          font-weight: 800;
          color: var(--accent-purple);
        }
        .score-total {
          font-size: 1rem;
          color: var(--text-muted);
          margin-left: 4px;
        }
        .score-summary {
          flex: 1;
        }
        .score-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }
        .score-feedback {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .score-disclaimer {
          font-size: 0.6875rem;
          color: var(--text-muted);
          font-style: italic;
        }
        .eval-breakdown-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 640px) {
          .eval-breakdown-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .eval-col {
          padding: 14px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
        }
        .col-covered {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .col-covered h5 {
          color: #4ade80;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .col-missing {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
        }
        .col-missing h5 {
          color: #f87171;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .eval-col ul {
          padding-left: 16px;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          color: var(--text-secondary);
        }
        .model-answer-section {
          padding: 14px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-sm);
        }
        .model-answer-section h5 {
          font-size: 0.8125rem;
          color: var(--accent-purple);
          font-weight: 700;
          margin-bottom: 6px;
        }
        .model-answer-text {
          font-size: 0.8125rem;
          color: var(--text-primary);
          line-height: 1.5;
        }

        /* ── Workspace 4: Quiz Runner ── */
        .quiz-start-card,
        .quiz-runner-card,
        .quiz-summary-card {
          padding: 32px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          max-width: 680px;
          margin: 0 auto;
          width: 100%;
        }
        .quiz-start-card,
        .quiz-summary-card {
          text-align: center;
        }
        .quiz-start-icon,
        .summary-icon {
          font-size: 3rem;
          margin-bottom: 12px;
        }
        .quiz-start-title,
        .summary-heading {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .quiz-start-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .quiz-progress-bar-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 8px;
        }
        .quiz-score-badge {
          font-weight: 700;
          color: var(--accent-purple);
        }
        .quiz-track {
          height: 6px;
          background: var(--bg-elevated);
          border-radius: var(--radius-pill);
          overflow: hidden;
          margin-bottom: 24px;
        }
        .quiz-fill {
          height: 100%;
          background: var(--accent-purple);
          transition: width 200ms ease;
        }
        .quiz-question-stem {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.5;
          margin-bottom: 20px;
        }
        .quiz-options-group {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }
        .quiz-option-btn {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-size: 0.875rem;
          text-align: left;
          cursor: pointer;
          transition: border-color var(--transition-fast), background var(--transition-fast);
        }
        .quiz-option-btn:hover:not(:disabled) {
          border-color: var(--border-strong);
          background: var(--bg-surface);
        }
        .quiz-option-btn.is-selected {
          border-color: var(--accent-purple);
          background: rgba(124, 109, 255, 0.08);
        }
        .quiz-option-btn.is-correct-answer {
          border-color: #22c55e;
          background: rgba(34, 197, 94, 0.15);
          color: #86efac;
        }
        .quiz-option-btn.is-wrong-answer {
          border-color: #ef4444;
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }
        .option-letter {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: var(--bg-page);
          border: 1px solid var(--border-default);
          font-size: 0.75rem;
          font-weight: 700;
          flex-shrink: 0;
        }
        .quiz-explanation-box {
          padding: 14px 16px;
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
          margin-bottom: 20px;
          border-left: 3px solid var(--accent-purple);
        }
        .explanation-status {
          font-weight: 700;
          font-size: 0.8125rem;
          margin-bottom: 6px;
        }
        .ans-correct { color: #4ade80; }
        .ans-incorrect { color: #f87171; }
        .explanation-text {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .explanation-citation {
          font-size: 0.6875rem;
          color: var(--text-muted);
          margin-top: 6px;
        }
        .quiz-action-bar {
          display: flex;
          justify-content: flex-end;
        }
        .quiz-submit-btn,
        .quiz-next-btn {
          height: 42px;
          padding: 0 24px;
        }

        .summary-score-dial {
          margin: 16px 0;
        }
        .summary-num {
          font-size: 3rem;
          font-weight: 800;
          color: var(--accent-purple);
        }
        .summary-den {
          font-size: 1.5rem;
          color: var(--text-muted);
        }
        .summary-percentage {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
        }
        .summary-weak-note {
          font-size: 0.8125rem;
          color: #fca5a5;
          margin-bottom: 24px;
        }
        .summary-btn-group {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        /* ── Workspace 5: Flashcards ── */
        .flashcards-start-card,
        .flashcards-runner-card {
          padding: 32px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          max-width: 640px;
          margin: 0 auto;
          width: 100%;
        }
        .flashcards-start-card {
          text-align: center;
        }
        .flashcard-icon {
          font-size: 3rem;
          margin-bottom: 12px;
        }
        .flashcard-start-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 8px;
        }
        .flashcard-start-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .flashcard-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .card-counter {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }
        .card-mastery-pills {
          display: flex;
          gap: 6px;
        }
        .mastery-pill {
          padding: 2px 8px;
          border-radius: var(--radius-pill);
          font-size: 0.6875rem;
          font-weight: 600;
        }
        .pill-mastered {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
        }
        .pill-review {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
        }

        /* 3D Flip Card Scene */
        .flashcard-scene {
          perspective: 1000px;
          height: 280px;
          cursor: pointer;
          margin-bottom: 20px;
        }
        .flashcard-inner {
          position: relative;
          width: 100%;
          height: 100%;
          text-align: center;
          transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .flashcard-scene.is-flipped .flashcard-inner {
          transform: rotateY(180deg);
        }
        .flashcard-face {
          position: absolute;
          width: 100%;
          height: 100%;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          padding: 24px;
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
        }
        .flashcard-front {
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
        }
        .flashcard-back {
          background: #1b1c24;
          border: 1px solid var(--accent-purple);
          transform: rotateY(180deg);
        }
        .card-side-tag {
          font-size: 0.6875rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 12px;
          letter-spacing: 0.05em;
        }
        .card-front-text {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.5;
          margin-bottom: 16px;
        }
        .card-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .card-back-text {
          font-size: 0.9375rem;
          color: var(--text-primary);
          line-height: 1.6;
          margin-bottom: 12px;
        }
        .card-source {
          font-size: 0.6875rem;
          color: var(--accent-purple);
        }

        .flashcard-controls-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }
        .card-action-btn {
          height: 40px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-needs-review {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #fca5a5;
        }
        .btn-flip {
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
        }
        .btn-got-it {
          background: rgba(34, 197, 94, 0.15);
          border: 1px solid rgba(34, 197, 94, 0.3);
          color: #86efac;
        }

        .card-nav-steps {
          display: flex;
          justify-content: space-between;
        }
        .card-step-arrow {
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 0.75rem;
          cursor: pointer;
        }
        .card-step-arrow:hover:not(:disabled) {
          color: var(--text-primary);
        }

        /* ── Workspace 6: Revision ── */
        .revision-summary-card {
          padding: 24px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .section-subtitle {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 12px;
        }
        .empty-weak-state {
          padding: 16px;
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }
        .weak-topics-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .weak-topic-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
        }
        .weak-topic-name {
          display: block;
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 2px;
        }
        .weak-topic-source {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        .weak-topic-teach-btn {
          background: rgba(124, 109, 255, 0.1);
          border: 1px solid var(--accent-purple);
          border-radius: var(--radius-sm);
          color: var(--accent-purple);
          font-size: 0.75rem;
          font-weight: 600;
          padding: 6px 12px;
          cursor: pointer;
        }
        .weak-topic-teach-btn:hover {
          background: var(--accent-purple);
          color: #ffffff;
        }

        .revision-schedule-action {
          display: flex;
          justify-content: flex-start;
        }
        .revision-gen-btn {
          height: 42px;
          font-weight: 600;
        }
        .revision-plan-output {
          padding: 20px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
        }
        .plan-title {
          font-size: 1rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 12px;
        }
        .plan-body {
          font-size: 0.875rem;
          line-height: 1.7;
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
