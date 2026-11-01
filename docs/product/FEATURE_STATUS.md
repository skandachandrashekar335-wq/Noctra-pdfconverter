# Feature Status Matrix

This document provides an honest, evidence-backed inventory of every feature in Noctra, classifying its current implementation and verification status.

---

## 1. Document Conversion Engine

| Feature | Implementation Status | Verification Status | Notes |
| :--- | :--- | :--- | :--- |
| **PDF Dark Mode Conversion** | Implemented | Verified (Unit + E2E) | Client-side Canvas + pdf-lib rasterization. |
| **Invisible Text Layer** | Implemented | Verified | Mode 3 text layer added to maintain PDF searchability. |
| **Link Annotation Preservation** | Implemented | Verified | Re-creates URI annotations on output pages. |
| **PPTX Dark Mode Conversion** | Implemented | Verified (Unit + E2E) | Vector-preserving XML/theme transformation via JSZip. |
| **Batch Conversion** | Implemented | Verified | Multi-file queue with per-item progress and abort signals. |
| **Custom Palette Selection** | Implemented | Verified | Presets (OLED Black, Charcoal, Slate, Midnight) + Custom HEX. |
| **DOCX Conversion** | Partially Implemented | Experimental | Extraction logic present in `docx-converter.ts`; not default output. |

---

## 2. Study AI Platform

| Feature | Implementation Status | Verification Status | Notes |
| :--- | :--- | :--- | :--- |
| **Executive Summary** (`summary`) | Implemented | Verified (Live API) | Concise overview with key takeaways. |
| **Key Concepts** (`key-points`) | Implemented | Verified (Live API) | Bulleted extraction of core principles. |
| **Clear Explanation** (`explain`) | Implemented | Verified (Live API) | Deep pedagogical breakdown with formulas and analogies. |
| **Practice Quiz** (`quiz`) | Implemented | Verified (Live API) | Generates structured multiple-choice questions with answer keys. |
| **Practice Exam** (`practice-test`) | Implemented | Verified (Live API) | Structured questions with point allocations (2, 5, 10 marks). |
| **Flashcards** (`flashcards`) | Implemented | Verified (Live API) | Front/back active recall cards. |
| **Revision Plan** (`revision-plan`) | Implemented | Verified (Live API) | Phased study schedule based on passage density. |
| **Weak Topics Analysis** (`weak-topics`)| Implemented | Verified (Live API) | Diagnostic evaluation of difficult concepts. |
| **AI Teacher Chat** (`teacher-chat`) | Implemented | Verified (Live API) | Socratic dialogue grounded in uploaded materials. |
| **Answer Evaluation** (`evaluate-answer`)| Implemented | Verified (Live API) | Scores student responses against model answers. |

---

## 3. Infrastructure, Security & Platform

| Feature | Implementation Status | Verification Status | Notes |
| :--- | :--- | :--- | :--- |
| **3-Tier AI Fallback Engine** | Implemented | Verified (Live API) | Sequential: Gemini Primary → Gemini Secondary → OpenRouter Free. |
| **Key Isolation & Health Check** | Implemented | Verified | Dedicated vs. Shared key reporting; skips invalid keys automatically. |
| **BYOK Client Override** | Implemented | Verified | LocalStorage key override via headers (`x-gemini-api-key`). |
| **Firebase Authentication** | Implemented | Verified | Email/Password + Google OAuth with Firebase Admin verification. |
| **Supabase History Persistence** | Implemented | Verified | Authenticated user history storage with Row-Level Security. |
| **Rate Limiting** | Implemented | Verified | Sliding window in-memory rate limiter per IP / UID. |
| **Legal Documentation** | Implemented | Verified | Privacy Policy (`/privacy`) and Terms of Service (`/terms`). |
| **Responsive Dark/Light Themes** | Implemented | Verified | CSS token system with OS preference detection. |
