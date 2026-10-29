"use client";

import React, { useState, useEffect } from "react";

const ONBOARDING_STORAGE_KEY = "noctra_onboarding_completed_v1";

const STEPS = [
  {
    title: "100% Local-First Document Privacy",
    subtitle: "Your documents never touch our servers",
    description:
      "Unlike traditional converters, Noctra converts your PDFs, DOCX, and PPTX files directly inside your browser memory using WebAssembly and Canvas. Zero upload required.",
    icon: (
      <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
    ),
  },
  {
    title: "Intelligent Dark Sweep Inversion",
    subtitle: "Zero blown-out figures or inverted photos",
    description:
      "Noctra analyzes page elements to preserve full-color photographic images, scientific diagrams, and code snippets while converting white backgrounds to deep, battery-saving dark themes.",
    icon: (
      <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    ),
  },
  {
    title: "Offline Reader & Study Assistant",
    subtitle: "Private reading with optional AI summaries",
    description:
      "Read your converted documents in the built-in dark reader, create bookmarks and notes, and optionally generate AI study flashcards with explicit consent.",
    icon: (
      <svg className="w-8 h-8 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
];

export function OnboardingModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!completed) {
        // Defer opening slightly so initial render completes cleanly
        const timer = setTimeout(() => setIsOpen(true), 50);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignore storage restrictions in private mode
    }
  }, []);

  const handleFinish = () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {}
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  if (!isOpen) return null;

  const step = STEPS[currentStep];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-lg bg-[#0f1115] border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentStep
                    ? "w-8 bg-purple-500"
                    : idx < currentStep
                    ? "w-3 bg-purple-800"
                    : "w-3 bg-zinc-800"
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleFinish}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Skip tour
          </button>
        </div>

        <div className="mb-6">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-5 shadow-inner">
            {step.icon}
          </div>
          <h2
            id="onboarding-title"
            className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-1"
          >
            {step.title}
          </h2>
          <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-3">
            {step.subtitle}
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {step.description}
          </p>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-800/80">
          {currentStep > 0 ? (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleNext}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs sm:text-sm transition-all shadow-lg shadow-purple-600/20 cursor-pointer"
          >
            {currentStep === STEPS.length - 1 ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
