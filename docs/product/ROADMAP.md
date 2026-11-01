# Noctra Product Roadmap

This roadmap outlines planned enhancements, architectural iterations, and feature expansions for Noctra.

---

## Phase 1: Core Hardening & Reliability (Complete)
- [x] Client-side PDF dark mode transformation with invisible text layers.
- [x] Vector-preserving PPTX dark mode transformation.
- [x] Multi-file batch processing with cancellation support.
- [x] 3-tier sequential AI fallback engine (Gemini Primary → Secondary → OpenRouter Free).
- [x] Dedicated vs. shared API key isolation and health tracking.
- [x] Full responsive redesign of `/privacy` and `/terms`.
- [x] Client Bring-Your-Own-Key (BYOK) support in Dashboard and Study Studio.

---

## Phase 2: Document Workspace & Organization (Planned)
- [ ] **Document Tagging & Folders**: Categorize historical conversions into custom subject folders.
- [ ] **Direct DOCX & EPUB Pipeline**: Expand native client-side rendering support for DOCX and EPUB documents.
- [ ] **Vector PDF Conversion Engine**: Explore selective vector-layer recoloring for text-heavy PDFs to eliminate rasterization.
- [ ] **Batch Archive Export**: Download entire batch conversion runs as structured ZIP archives.

---

## Phase 3: Advanced Study Intelligence (Planned)
- [ ] **Spaced Repetition Scheduler**: SM-2 algorithm integration for flashcard revision timing.
- [ ] **Interactive Voice Teacher**: Audio-enabled Socratic study dialogue using Web Speech API or Gemini Live API.
- [ ] **Mathematical Formula Extraction**: Automated LaTeX parsing and formula rendering for STEM documents.
- [ ] **Collaborative Study Rooms**: Shareable quizzes and flashcard decks scoped to study groups.

---

## Phase 4: Enterprise & Offline Readiness (Planned)
- [ ] **Full Offline PWA (Progressive Web App)**: Offline document conversion without active internet connection.
- [ ] **Self-Hosted Deployment Bundle**: Dockerized distribution with local Ollama / vLLM provider adapters.
- [ ] **Automated Accessibility Compliance**: Continuous WCAG 2.1 AA automated auditing in CI pipeline.
