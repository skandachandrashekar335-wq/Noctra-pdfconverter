"use client";

import React, { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { StudyTask } from "@/lib/ai-study";

const STUDY_TASKS: Array<{ id: StudyTask; label: string; desc: string }> = [
  { id: "summary", label: "Executive Summary", desc: "Concise, structured chapter overview" },
  { id: "key-points", label: "Key Concepts", desc: "Bullet-point breakdown of core principles" },
  { id: "flashcards", label: "Flashcards", desc: "Question & answer study cards" },
  { id: "quiz", label: "Practice Quiz", desc: "Multiple-choice questions with answer key" },
  { id: "explain", label: "Clear Explanation", desc: "Deep dive with preserved equations and code" },
  { id: "practice-test", label: "Practice Exam", desc: "Full assessment with grading rubric" },
  { id: "revision-plan", label: "Revision Schedule", desc: "Spaced-repetition study milestones" },
  { id: "weak-topics", label: "Gap Analysis", desc: "Identifies difficult concepts needing review" },
];

export function StudyStudio() {
  const { user } = useAuth();
  const [task, setTask] = useState<StudyTask>("summary");
  const [text, setText] = useState("");
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setResult(null);

    if (!text.trim()) {
      setError("Please paste or type study passages to analyze.");
      return;
    }

    if (!consent) {
      setError("Explicit consent is required before text is processed by the AI study provider.");
      return;
    }

    setLoading(true);
    try {
      const token = user ? await user.getIdToken() : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Generate a client synthetic document key (sha-256 length hex)
      const syntheticKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const res = await fetch("/api/study", {
        method: "POST",
        headers,
        body: JSON.stringify({
          documentKey: syntheticKey,
          task,
          question: question.trim() ? question.trim() : undefined,
          consent: true,
          passages: [{ pageNumber: 1, text: text.trim().slice(0, 5000) }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          setError("Rate limit reached. Please wait a moment before generating again.");
        } else if (res.status === 503) {
          setError(data.error || "The AI Study service is temporarily unavailable. Please try again shortly.");
        } else {
          setError(data.error || "Study assistant could not complete this request.");
        }
      } else {
        setResult(data.answer);
      }
    } catch {
      setError("Network error connecting to study assistant. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="study-studio-root">
      <div className="study-grid">
        {/* Controls form */}
        <form onSubmit={handleGenerate} className="study-form">
          {/* Study objective section */}
          <div className="study-field">
            <div className="study-field-header">
              <label className="study-label">
                Select Study Objective
              </label>
              <span className="study-badge">
                8 Formats
              </span>
            </div>
            <div className="study-tasks-grid">
              {STUDY_TASKS.map((t) => {
                const isActive = task === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTask(t.id)}
                    className={`study-task-card ${isActive ? "is-active" : ""}`}
                    aria-pressed={isActive}
                  >
                    <span className="study-task-title">{t.label}</span>
                    <span className="study-task-desc">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Passages / notes input */}
          <div className="study-field">
            <div className="study-field-header">
              <label htmlFor="study-text" className="study-label">
                Study Passages / Notes
              </label>
              <span className="study-counter">
                {text.length.toLocaleString()} / 5,000
              </span>
            </div>
            <textarea
              id="study-text"
              rows={6}
              maxLength={5000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste lecture notes, textbook excerpts, or study material here..."
              className="study-textarea"
            />
          </div>

          {/* Specific focus input */}
          <div className="study-field">
            <label htmlFor="study-question" className="study-label mb-2">
              Specific Focus / Question (Optional)
            </label>
            <input
              id="study-question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Focus on memory hierarchy and cache coherence"
              className="study-input"
            />
          </div>

          {/* Explicit privacy consent checkbox */}
          <div className="study-consent-card">
            <label className="study-consent-layout">
              <span className="study-checkbox-col">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="study-checkbox"
                />
              </span>
              <span className="study-consent-text">
                <strong className="study-consent-strong">Explicit Privacy Consent:</strong>{" "}
                I authorize sending the supplied passages to Google Gemini to generate study aids. No personal credentials or original PDF files are transmitted.
              </span>
            </label>
          </div>

          {/* Generate button */}
          <button
            type="submit"
            disabled={loading || !consent}
            className="study-generate-btn"
          >
            {loading ? (
              <>
                <svg className="study-spinner" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Analyzing with Gemini...</span>
              </>
            ) : (
              <span>Generate Study Aid</span>
            )}
          </button>

          {error && (
            <div role="alert" className="study-error-alert">
              {error}
            </div>
          )}
        </form>

        {/* Output display */}
        <div className="study-output-panel">
          <div className="study-output-header">
            <div className="study-output-title-group">
              <span className="study-output-title">
                Generated Study Output
              </span>
              <span className="study-output-badge">
                {STUDY_TASKS.find((t) => t.id === task)?.label ?? "Study Aid"}
              </span>
            </div>
            {result && (
              <button
                type="button"
                onClick={handleCopy}
                className="study-copy-btn"
              >
                {copied ? "✓ Copied!" : "Copy Output"}
              </button>
            )}
          </div>

          <div className="study-output-body">
            {result ? (
              <div className="study-result-prose">
                {result}
              </div>
            ) : (
              <div className="study-empty-state">
                <div className="study-empty-icon-wrap" aria-hidden="true">
                  <svg className="study-empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h3 className="study-empty-heading">Ready for Study Analysis</h3>
                <p className="study-empty-desc">
                  Paste textbook excerpts or lecture notes on the left, pick a study objective, and generate instant summaries, flashcards, and quizzes.
                </p>
                <div className="study-empty-chips">
                  <span className="study-chip">📖 Executive Summary</span>
                  <span className="study-chip">🃏 Flashcards</span>
                  <span className="study-chip">🎯 Practice Quiz</span>
                  <span className="study-chip">⏱ Revision Plan</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .study-studio-root {
          width: 100%;
        }
        .study-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 28px;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .study-grid {
            grid-template-columns: minmax(400px, 5fr) minmax(0, 7fr);
            gap: 32px;
            align-items: start;
          }
        }

        /* ── Form Column ── */
        .study-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .study-field {
          display: flex;
          flex-direction: column;
        }
        .study-field-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .study-label {
          font-family: var(--font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-muted);
          line-height: 1.2;
          display: block;
        }
        .study-badge {
          font-family: var(--font-body);
          font-size: 0.625rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
          background: var(--bg-inset);
          padding: 2px 8px;
          border-radius: var(--radius-pill);
          border: 1px solid var(--border-subtle);
          line-height: 1.4;
        }
        .study-counter {
          font-family: var(--font-body);
          font-size: 0.625rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-variant-numeric: tabular-nums;
        }

        /* ── Study Objective Cards Grid ── */
        .study-tasks-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 520px) {
          .study-tasks-grid {
            grid-template-columns: repeat(2, 1fr);
            align-items: stretch;
          }
        }
        .study-task-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          height: 100%;
          min-height: 72px;
          padding: 13px 15px;
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          text-align: left;
          cursor: pointer;
          transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
          box-sizing: border-box;
        }
        .study-task-card:hover {
          border-color: var(--border-default);
          background: var(--bg-elevated);
        }
        .study-task-card.is-active {
          background: var(--accent-purple-dim);
          border-color: var(--accent-purple);
          box-shadow: 0 0 0 1px var(--accent-purple), 0 4px 12px rgba(124, 109, 255, 0.15);
        }
        .study-task-title {
          display: block;
          width: 100%;
          font-family: var(--font-body);
          font-size: 0.8125rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1.25;
          margin: 0;
          padding: 0;
        }
        .study-task-desc {
          display: block;
          width: 100%;
          font-family: var(--font-body);
          font-size: 0.6875rem;
          color: var(--text-muted);
          line-height: 1.35;
          margin-top: 5px;
          margin-bottom: 0;
          padding: 0;
        }
        .study-task-card.is-active .study-task-desc {
          color: var(--text-secondary);
        }

        /* ── Textarea & Inputs ── */
        .study-textarea {
          width: 100%;
          min-height: 125px;
          padding: 13px 15px;
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 0.8125rem;
          line-height: 1.55;
          resize: vertical;
          box-sizing: border-box;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
          margin: 0;
        }
        .study-textarea::placeholder,
        .study-input::placeholder {
          color: var(--text-muted);
          opacity: 0.85;
          font-family: var(--font-body);
          font-size: 0.8125rem;
          line-height: 1.55;
        }
        .study-textarea:focus,
        .study-input:focus {
          outline: none;
          border-color: var(--accent-purple);
          box-shadow: 0 0 0 2px var(--accent-purple-dim);
        }
        .study-input {
          width: 100%;
          height: 40px;
          padding: 0 14px;
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 0.8125rem;
          line-height: 38px;
          box-sizing: border-box;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
          margin: 0;
        }
        .mb-2 {
          margin-bottom: 8px;
        }

        /* ── Privacy Consent Card ── */
        .study-consent-card {
          padding: 12px 14px;
          border-radius: var(--radius-lg);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          box-sizing: border-box;
        }
        .study-consent-layout {
          display: grid;
          grid-template-columns: 18px 1fr;
          column-gap: 12px;
          align-items: start;
          cursor: pointer;
          width: 100%;
        }
        .study-checkbox-col {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          margin-top: 1px;
        }
        .study-checkbox {
          width: 18px;
          height: 18px;
          accent-color: var(--accent-purple);
          cursor: pointer;
          margin: 0;
          padding: 0;
          flex-shrink: 0;
        }
        .study-consent-text {
          font-family: var(--font-body);
          font-size: 0.75rem;
          line-height: 1.5;
          color: var(--text-muted);
          word-break: break-word;
        }
        .study-consent-strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        /* ── Generate Button ── */
        .study-generate-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          height: 44px;
          padding: 0 18px;
          border-radius: var(--radius-md);
          border: none;
          background: var(--gradient-accent);
          color: #ffffff;
          font-family: var(--font-body);
          font-size: 0.8125rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(124, 109, 255, 0.35);
          transition: opacity var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
        }
        .study-generate-btn:hover:not(:disabled) {
          box-shadow: 0 6px 20px rgba(124, 109, 255, 0.45);
          transform: translateY(-1px);
        }
        .study-generate-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }
        .study-spinner {
          width: 18px;
          height: 18px;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .study-error-alert {
          padding: 12px 14px;
          border-radius: var(--radius-md);
          background: rgba(248, 113, 113, 0.12);
          border: 1px solid rgba(248, 113, 113, 0.3);
          color: var(--accent-bad);
          font-size: 0.75rem;
          line-height: 1.5;
        }

        /* ── Output Panel Column ── */
        .study-output-panel {
          display: flex;
          flex-direction: column;
          min-height: 520px;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          padding: 24px;
          box-shadow: var(--shadow-card);
        }
        .study-output-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border-hairline);
          flex-wrap: wrap;
        }
        .study-output-title-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .study-output-title {
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-primary);
          line-height: 1;
        }
        .study-output-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 12px;
          border-radius: var(--radius-pill);
          font-family: var(--font-body);
          font-size: 0.6875rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          background: var(--accent-purple-dim);
          border: 1px solid rgba(124, 109, 255, 0.35);
          color: var(--accent-purple);
          line-height: 1.2;
          white-space: nowrap;
        }
        .study-copy-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 30px;
          padding: 0 12px;
          border-radius: var(--radius-md);
          background: var(--bg-inset);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: background var(--transition-fast), border-color var(--transition-fast);
        }
        .study-copy-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--border-strong);
        }
        .study-output-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          margin-top: 16px;
          overflow-y: auto;
        }
        .study-result-prose {
          font-family: var(--font-body);
          font-size: 0.8125rem;
          line-height: 1.7;
          color: var(--text-primary);
          white-space: pre-wrap;
        }

        /* ── Empty State ── */
        .study-empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 36px 20px;
          min-height: 420px;
        }
        .study-empty-icon-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          border-radius: var(--radius-xl);
          background: var(--accent-purple-dim);
          border: 1px solid rgba(124, 109, 255, 0.25);
          color: var(--accent-purple);
          margin-bottom: 16px;
        }
        .study-empty-icon {
          width: 24px;
          height: 24px;
        }
        .study-empty-heading {
          font-family: var(--font-body);
          font-size: 1.0625rem;
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin-top: 0;
          margin-bottom: 8px;
        }
        .study-empty-desc {
          font-family: var(--font-body);
          font-size: 0.8125rem;
          color: var(--text-muted);
          max-width: 380px;
          line-height: 1.6;
          margin-top: 0;
          margin-bottom: 24px;
        }
        .study-empty-chips {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 10px;
          max-width: 440px;
        }
        .study-chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 14px;
          border-radius: var(--radius-pill);
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 500;
          line-height: 1.3;
        }
      `}</style>
    </div>
  );
}
