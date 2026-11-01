# Noctra — Dark-Mode Document Conversion & AI Study Assistant

[![CI](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/actions/workflows/ci.yml/badge.svg)](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-noctra--pdfconverter.vercel.app-purple)](https://noctra-pdfconverter.vercel.app)

> **Browser-first document conversion and AI-powered study platform.**  
> Convert PDFs and PowerPoint presentations to dark mode — locally in your browser, with zero server uploads.  
> Study any document with an AI teacher, practice quizzes, flashcards, and exam preparation.

---

## Live Demo

**[https://noctra-pdfconverter.vercel.app](https://noctra-pdfconverter.vercel.app)**

---

## Feature Overview

### Document Conversion (100% browser-side — files never leave your device)

| Feature | Status |
|---------|--------|
| PDF → Dark-mode PDF | ✅ Implemented |
| PPTX → Dark-mode PPTX | ✅ Implemented |
| Batch conversion (multiple files) | ✅ Implemented |
| Custom dark background colour | ✅ Implemented |
| Conversion profiles | ✅ Implemented |
| Invisible text layer (searchable output) | ✅ Implemented |
| Link annotation preservation | ✅ Implemented |
| Conversion history (authenticated users) | ✅ Implemented |

### AI Study Assistant (requires AI provider credentials)

| Objective | Task ID | Status |
|-----------|---------|--------|
| Executive Summary | `summary` | ✅ Implemented |
| Key Concepts | `key-points` | ✅ Implemented |
| Clear Explanation | `explain` | ✅ Implemented |
| Practice Quiz (multiple-choice with explanations) | `quiz` | ✅ Implemented |
| Practice Exam (structured exam questions) | `practice-test` | ✅ Implemented |
| Flashcards | `flashcards` | ✅ Implemented |
| Revision Plan | `revision-plan` | ✅ Implemented |
| Weak Topics / Gap Analysis | `weak-topics` | ✅ Implemented |
| AI Teacher (conversational) | `teacher-chat` | ✅ Implemented |
| Exam Questions with Model Answers | `exam-questions` | ✅ Implemented |
| Answer Evaluation | `evaluate-answer` | ✅ Implemented |

### Platform

| Feature | Status |
|---------|--------|
| Firebase authentication (email + Google) | ✅ Implemented |
| Protected dashboard | ✅ Implemented |
| Dark / Light / System theme | ✅ Implemented |
| 3-tier AI provider fallback | ✅ Implemented |
| Bring-Your-Own-Key (BYOK) in UI | ✅ Implemented |
| Privacy Policy & Terms pages | ✅ Implemented |
| Responsive mobile layout | ✅ Implemented |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16.4](https://nextjs.org/) (App Router) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19, Tailwind CSS 4 |
| PDF Processing | [PDF.js](https://mozilla.github.io/pdf.js/) + [pdf-lib](https://pdf-lib.js.org/) |
| PPTX Processing | [JSZip](https://stuk.github.io/jszip/) (ZIP/XML manipulation) |
| Authentication | [Firebase Auth](https://firebase.google.com/products/auth) (client) + Firebase Admin SDK (server) |
| Database / History | [Supabase](https://supabase.com/) (server-side service role key) |
| AI: Primary | Google Gemini API |
| AI: Fallback | OpenRouter (free tier) |
| Deployment | [Vercel](https://vercel.com/) |
| Testing | Node.js built-in `--test` runner (335 tests) |
| CI | GitHub Actions |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         BROWSER                             │
│                                                             │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  PDF.js     │    │   JSZip      │    │  pdf-lib      │  │
│  │  (render)   │    │  (PPTX XML)  │    │  (compose)    │  │
│  └──────┬──────┘    └──────┬───────┘    └──────┬────────┘  │
│         └──────────────────┴────────────────────┘          │
│              Document conversion is LOCAL — no upload       │
└─────────────────────────────────────────────────────────────┘
                    │ Study text (with consent)
                    │ Auth tokens
                    │ History metadata
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    NEXT.JS SERVER (Vercel)                  │
│                                                             │
│  /api/study ──► AI Fallback Engine ──► Gemini Primary       │
│                                    └──► Gemini Secondary    │
│                                    └──► OpenRouter Free     │
│                                                             │
│  /api/history ──► Firebase token verify ──► Supabase        │
│  /api/auth    ──► Firebase Admin SDK                        │
└─────────────────────────────────────────────────────────────┘
```

**Privacy model**: Document bytes never leave the browser. Only extracted text passages (with explicit user consent) are sent to AI providers via the server-side API route. See [docs/security/PRIVACY_ARCHITECTURE.md](docs/security/PRIVACY_ARCHITECTURE.md).

---

## Getting Started

### Prerequisites

- **Node.js 24.x** ([download](https://nodejs.org/))
- **npm** (comes with Node.js)
- A modern browser (Chrome 100+, Firefox 100+, Edge 100+, Safari 15+)

### Installation

```bash
git clone https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter.git
cd Noctra-pdfconverter
npm ci
cp .env.example .env.local
```

Edit `.env.local` with your credentials (see [Environment Configuration](#environment-configuration)).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note**: PDF and PPTX conversion work without any environment variables — they run entirely in the browser. Authentication and AI Study require additional configuration.

---

## Environment Configuration

Copy `.env.example` to `.env.local` and configure the values you need.

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | For auth | Firebase client SDK config (6 variables) |
| `FIREBASE_ADMIN_PROJECT_ID` | For auth | Server-side token verification |
| `SUPABASE_URL` | For history | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | For history | Server-side Supabase access |
| `GEMINI_API_KEY` | For AI Study | Google Gemini API key (primary provider) |
| `GEMINI_PRIMARY_MODEL` | Optional | Default: `gemini-3.5-flash` |
| `GEMINI_SECONDARY_API_KEY` | Optional | Dedicated key for secondary provider |
| `GEMINI_SECONDARY_MODEL` | Optional | Default: `gemini-flash-lite-latest` |
| `GEMINI_ALLOW_SHARED_KEY` | Optional | Set `true` to share primary key with secondary |
| `OPENROUTER_API_KEY` | For OpenRouter fallback | OpenRouter API key |
| `OPENROUTER_MODEL` | Optional | Default: `nvidia/nemotron-3.5-lightning:free` |

> **Security**: Never prefix server-side credentials with `NEXT_PUBLIC_`. Never commit `.env.local`. See [docs/development/ENVIRONMENT_VARIABLES.md](docs/development/ENVIRONMENT_VARIABLES.md) for full details.

---

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type-check
npm test             # Run test suite (335 unit tests)
npm run test:e2e     # Browser smoke test (requires local server)
npm run verify:backend  # Verify Supabase RLS and backend config
```

---

## AI Provider Fallback Architecture

Noctra uses a sequential 3-tier fallback for all AI Study requests:

```
Request
  │
  ├─► 1. Gemini Primary (GEMINI_API_KEY)
  │       └── Success → return result
  │       └── Fail (rate limit / timeout / unavailable) → try next
  │
  ├─► 2. Gemini Secondary (GEMINI_SECONDARY_API_KEY or shared key)
  │       └── If primary had auth failure AND secondary shares the same key → skip
  │       └── Success → return result
  │       └── Fail → try next
  │
  └─► 3. OpenRouter Free (OPENROUTER_API_KEY)
          └── Success → return result
          └── Fail → return structured error
```

The provider that served each response is identified in the API response metadata.

---

## Testing

```bash
npm test
```

The test suite uses the Node.js built-in `--test` runner (no external test framework required). Tests cover:

- PDF conversion pipeline (`pdf-converter.test.ts`)
- PPTX conversion pipeline (`pptx-converter.test.ts`)
- AI provider engine and fallback logic (`ai-provider-fallback.test.ts`)
- AI Study validation and prompt construction (`ai-study.test.ts`)
- Authentication and access control (`auth-resolver.test.ts`, `access-control.test.ts`)
- API validation and routing (`routing-contract.test.ts`, `validation.test.ts`)
- Rate limiting (`rate-limiter.test.ts`)
- History and reader handlers
- And more (86 test suites total)

See [docs/development/TESTING.md](docs/development/TESTING.md) for details.

---

## Deployment

Noctra is deployed on [Vercel](https://vercel.com/). Pushing to `main` triggers an automatic deployment.

**Manual deployment:**

```bash
npx vercel --prod
```

**Required Vercel environment variables**: See [docs/deployment/VERCEL_DEPLOYMENT.md](docs/deployment/VERCEL_DEPLOYMENT.md).

---

## Privacy Model

- **Document conversion** is entirely browser-side. PDF and PPTX files are **never uploaded** to any server.
- **AI Study** sends extracted text passages to AI providers **only after explicit user consent**.
- **Authentication** uses Firebase. **History** (file metadata only, not content) is stored in Supabase for authenticated users.
- Users can delete their account and all associated data.

Full details: [PRIVACY.md](PRIVACY.md) and [docs/security/PRIVACY_ARCHITECTURE.md](docs/security/PRIVACY_ARCHITECTURE.md).

---

## Known Limitations

- **PDF output is rasterised** — the pixel-level dark transform cannot operate on vector content without rendering. The output is JPEG-compressed images in a PDF container. An invisible text layer is added for searchability.
- **PPTX gradient fills** may not transform perfectly; complex gradient definitions are partially supported.
- **Free AI provider availability** — the OpenRouter free tier depends on model availability, which can change.
- **Supabase history** requires the migrations to be applied (migrations 0003/0004 are authored but require authorization to apply to production).

## Legacy Files

The repository contains `firestore.rules` and `firestore.indexes.json`. These are **legacy configuration files** from an earlier Firestore-based history implementation. The application was migrated to Supabase. These files are retained per the migration decision: nothing is deleted until the Supabase replacement has been fully verified against a live project. No runtime code imports `firebase/firestore`.

---

## Roadmap

See [docs/product/ROADMAP.md](docs/product/ROADMAP.md) for the detailed roadmap.

Key planned improvements:
- Document library with search, folders and tags
- Accessibility audit (WCAG 2.1 AA)
- Performance budgets in CI
- DOCX to dark PDF conversion
- Additional AI study features (custom prompts, spaced repetition)

---

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

Quick checklist:
1. `npm test` must pass
2. `npx tsc --noEmit` must pass
3. `npm run lint` must pass
4. `npm run build` must succeed
5. No secrets or credentials committed

---

## Security

To report a security vulnerability, use [GitHub Security Advisories](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/security/advisories/new) — **do not open a public issue**.

See [SECURITY.md](SECURITY.md) for the full security policy.

---

## License

Copyright © 2026 skandachandrashekar335  
Licensed under the [Apache License 2.0](LICENSE).
