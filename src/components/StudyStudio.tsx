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
          passages: [{ pageNumber: 1, text: text.trim().slice(0, 15000) }],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Study assistant could not complete this request.");
      } else {
        setResult(data.answer);
      }
    } catch {
      setError("Network error connecting to study assistant.");
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Controls form */}
        <form onSubmit={handleGenerate} className="lg:col-span-5 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Select Study Objective
              </label>
              <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                8 Formats
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {STUDY_TASKS.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTask(t.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[64px] flex flex-col justify-center ${
                    task === t.id
                      ? "bg-purple-950/40 border-purple-500 text-white shadow-md shadow-purple-950/50 ring-1 ring-purple-500/40"
                      : "bg-[#0f1115] border-zinc-800/90 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 hover:bg-[#14161c]"
                  }`}
                >
                  <p className="text-xs font-semibold leading-tight text-zinc-100">{t.label}</p>
                  <p className="text-[10.5px] text-zinc-400 mt-1 leading-snug break-words">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="study-text" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Study Passages / Notes
              </label>
              <span className="text-[10px] text-zinc-500">
                {text.length}/15,000
              </span>
            </div>
            <textarea
              id="study-text"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste lecture notes, textbook excerpts, or study material here..."
              className="w-full px-4 py-3 rounded-xl bg-[#0f1115] border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/60 text-xs font-sans leading-relaxed resize-y min-h-[140px]"
            />
          </div>

          <div>
            <label htmlFor="study-question" className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">
              Specific Focus / Question (Optional)
            </label>
            <input
              id="study-question"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Focus on memory hierarchy and cache coherence"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0f1115] border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500/60 text-xs"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-[#0f1115] border border-zinc-800/80">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 rounded border-zinc-700 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <span className="text-[11px] text-zinc-400 leading-relaxed">
                <strong className="text-zinc-200">Explicit Privacy Consent:</strong> I authorize sending the supplied passages to Google Gemini to generate study aids. No personal credentials or original PDF files are transmitted.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !consent}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 active:to-indigo-700 disabled:opacity-40 text-white font-semibold text-xs uppercase tracking-wider transition-all shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing with Gemini...
              </>
            ) : (
              "Generate Study Aid"
            )}
          </button>

          {error && (
            <div role="alert" className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200 text-xs leading-relaxed">
              {error}
            </div>
          )}
        </form>

        {/* Output display */}
        <div className="lg:col-span-7 flex flex-col min-h-[520px] bg-[#0f1115] border border-zinc-800/80 rounded-2xl p-5 sm:p-6 shadow-inner">
          <div className="flex items-center justify-between pb-3.5 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Generated Study Output
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-800/40 text-[10px] text-purple-300 uppercase tracking-wider font-semibold">
                {STUDY_TASKS.find((t) => t.id === task)?.label ?? "Study Aid"}
              </span>
            </div>
            {result && (
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center gap-1.5 border border-zinc-700/60 cursor-pointer"
              >
                {copied ? "✓ Copied!" : "Copy Output"}
              </button>
            )}
          </div>

          <div className="flex-1 mt-4 overflow-y-auto">
            {result ? (
              <div className="prose prose-invert prose-zinc max-w-none text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-zinc-200">
                {result}
              </div>
            ) : (
              <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                <div className="w-12 h-12 rounded-2xl bg-purple-950/30 border border-purple-800/30 flex items-center justify-center mb-4 text-purple-400">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-zinc-200">Ready for Study Analysis</p>
                <p className="text-xs text-zinc-400 max-w-sm mt-1.5 leading-relaxed">
                  Paste textbook excerpts or lecture notes on the left, pick a study objective, and generate instant summaries, flashcards, and quizzes.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-5 text-[11px] text-zinc-400">
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">📖 Executive Summary</span>
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">🃏 Flashcards</span>
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">🎯 Practice Quiz</span>
                  <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">⏱ Revision Plan</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
