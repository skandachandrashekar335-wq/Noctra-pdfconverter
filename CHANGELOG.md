# Changelog

All notable changes to Noctra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Dependabot configuration for automated dependency updates
- GitHub issue templates (bug report, feature request)
- Pull request template
- Comprehensive `docs/` hierarchy (architecture, development, deployment, security, product)
- CI workflow improvement: separate `dependency-audit` job, build-time placeholder env vars

### Changed
- `.gitignore` extended to exclude `audit-screenshots/` and transient agent scripts
- `CONTRIBUTING.md` updated to reflect the current test count (335 tests / 86 suites)
- CI workflow documentation improved with build-time environment placeholders

### Fixed
- Dashboard `refreshProviderStatuses` — moved `setCustomKeySaved` inside async callback to avoid React 19 cascading-render lint error

---

## [0.1.0] — 2026-11-01

Initial production release.

### Added
- **PDF dark-mode conversion** — browser-side pixel-level transform using PDF.js + pdf-lib
  - Invisible text layer for searchable output
  - Link annotation preservation
  - Custom background colour support
  - Conversion profiles
- **PPTX dark-mode conversion** — ZIP/XML structural transform via JSZip (vector-preserving)
- **Batch conversion** — multiple files with individual progress and cancellation
- **Firebase authentication** — email/password and Google sign-in
- **Supabase history** — authenticated conversion history with server-side RLS
- **3-tier AI Study fallback engine** — Gemini Primary → Gemini Secondary → OpenRouter Free
  - 11 study objectives: summary, key-points, explain, quiz, practice-test, flashcards, revision-plan, weak-topics, teacher-chat, exam-questions, evaluate-answer
  - Sequential fallback with auth-failure short-circuit
  - Bring-Your-Own-Key (BYOK) UI
  - Provider health status reporting
- **Dashboard** — upload, conversion history, settings, theme toggle
- **Legal pages** — Privacy Policy (`/privacy`) and Terms of Service (`/terms`) with responsive layout
- **Dark/Light/System theme** with OS preference following
- **CI** — GitHub Actions quality gate (typecheck, lint, test, build)
- **Open-source governance** — LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, PRIVACY, CHANGELOG

### Security
- `.env.local` gitignored; `.env.example` contains placeholder names only
- Server-side credentials never prefixed `NEXT_PUBLIC_`
- AI consent gateway — user must explicitly consent before study text is sent to AI providers
- Firebase Admin token verification on protected API routes
- Supabase row-level security enforced

### Known limitations
- PDF output is rasterised (JPEG-in-PDF); invisible text layer restores searchability
- PPTX complex gradient fills partially supported
- Supabase migrations 0003/0004 (library/workspace features) authored but not yet applied to production
- Free AI provider availability subject to change

[Unreleased]: https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/releases/tag/v0.1.0
