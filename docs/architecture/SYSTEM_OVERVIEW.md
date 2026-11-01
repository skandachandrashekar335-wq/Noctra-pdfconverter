# Noctra — System Architecture Overview

Noctra is a **browser-first** document conversion and AI-powered study platform. Its central privacy guarantee is that document bytes never leave the user's machine during conversion — all rendering and transformation happens in the browser via WebAssembly and JavaScript.

---

## High-Level Architecture

```mermaid
graph TD
    subgraph Browser["🌐 Browser (Client-Side)"]
        Upload["File Upload\n(PDF / PPTX / DOCX)"]
        PDFjs["PDF.js\n(render pages to canvas)"]
        JSZip["JSZip\n(ZIP/XML manipulation)"]
        PDFLib["pdf-lib\n(compose output PDF)"]
        DarkSweep["Dark Sweep\nPixel Transform"]
        TextLayer["Invisible Text Layer\n(accessibility / copy-paste)"]
        Output["Converted File\n(download / preview)"]

        Upload --> PDFjs
        Upload --> JSZip
        PDFjs --> DarkSweep
        DarkSweep --> PDFLib
        PDFLib --> TextLayer
        TextLayer --> Output
        JSZip --> Output
    end

    subgraph NextAPI["⚡ Next.js API Routes (Server-Side)"]
        HistoryAPI["/api/history\n(CRUD for conversion history)"]
        StudyAPI["/api/study\n(AI study requests)"]
        RateLimiter["Rate Limiter\n(per-UID throttle)"]

        RateLimiter --> HistoryAPI
        RateLimiter --> StudyAPI
    end

    subgraph Auth["🔐 Firebase Auth"]
        FirebaseClient["Firebase Client SDK\n(browser sign-in)"]
        FirebaseAdmin["Firebase Admin SDK\n(server token verification)"]
    end

    subgraph Database["🗄️ Supabase (Server-Only)"]
        SupabaseDB["Postgres + RLS\n(conversion history,\nuser metadata)"]
    end

    subgraph AIProviders["🤖 AI Providers (3-Tier Fallback)"]
        GeminiPrimary["Gemini Primary\n(GEMINI_API_KEY)"]
        GeminiSecondary["Gemini Secondary\n(GEMINI_SECONDARY_API_KEY)"]
        OpenRouter["OpenRouter Free\n(OPENROUTER_API_KEY)"]

        GeminiPrimary -- "auth failure / unavailable" --> GeminiSecondary
        GeminiSecondary -- "auth failure / unavailable" --> OpenRouter
    end

    Browser -- "POST /api/history\n(Bearer token + metadata)" --> NextAPI
    Browser -- "POST /api/study\n(Bearer token + text passages)" --> NextAPI

    FirebaseClient -- "ID token" --> Browser
    NextAPI -- "verifyIdToken()" --> FirebaseAdmin
    NextAPI -- "service role key" --> SupabaseDB
    StudyAPI --> AIProviders
```

---

## Privacy-First Model

| Operation | Where it runs | Data leaves the browser? |
|---|---|---|
| PDF dark-mode conversion | 100% browser | ❌ Never |
| PPTX dark-mode conversion | 100% browser | ❌ Never |
| File preview / thumbnail | 100% browser | ❌ Never |
| AI Study (summary, quiz, etc.) | Server (`/api/study`) | ✅ Only extracted text, with **explicit user consent** |
| Conversion history storage | Server (`/api/history`) | ✅ Metadata only (filename, page count, timestamp) — no file bytes |
| Authentication | Firebase (client + server) | ✅ Standard OAuth identity tokens |

---

## Key Technology Choices

| Concern | Technology | Rationale |
|---|---|---|
| PDF rendering | PDF.js (pdfjs-dist 6.x) | Gold-standard browser PDF renderer; WASM-accelerated |
| PDF output composition | pdf-lib | Pure JS; runs in browser with no server round-trip |
| PPTX manipulation | JSZip + XML parsing | PPTX is a ZIP of XML; vector paths preserved; no rasterisation |
| Authentication | Firebase Auth | Google-managed; no custom auth server needed |
| Server-side auth verification | Firebase Admin SDK | Cryptographically verifies ID tokens; never trusts client-supplied UIDs |
| History persistence | Supabase (Postgres + RLS) | Row-Level Security ensures users can only see their own history |
| AI study | Gemini + OpenRouter | 3-tier fallback ensures high availability without single-provider lock-in |
| Framework | Next.js 16.4.3 | App Router with React 19 Server Components and API routes |

---

## Component Map

```
src/
├── app/
│   ├── api/
│   │   ├── history/      — CRUD for conversion history (Firebase token verified)
│   │   ├── study/        — AI study endpoint (3-provider fallback)
│   │   └── reader/       — PDF reader API (WIP)
│   ├── dashboard/        — Authenticated dashboard (history, settings)
│   ├── study/            — AI study workspace
│   └── (landing)/        — Public landing page
├── components/
│   ├── ConversionEngine/ — PDF/PPTX conversion UI
│   ├── BatchUploadZone   — Multi-file batch conversion
│   └── AuthGuard         — Client-side route protection
└── lib/
    ├── pdf-converter.ts          — PDF dark sweep engine
    ├── pptx-converter.ts         — PPTX color remap engine
    ├── ai-provider-engine.ts     — 3-tier provider fallback logic
    ├── ai-study.ts               — Study task orchestration
    ├── supabase-config.ts        — Supabase client (server-only guard)
    └── validation.ts             — Input/output validation utilities
```

---

## Related Documentation

- [Document Processing Pipeline](./DOCUMENT_PROCESSING.md)
- [AI Study Engine](./AI_STUDY_ENGINE.md)
- [AI Provider Fallback](./AI_PROVIDER_FALLBACK.md)
- [Authentication](./AUTHENTICATION.md)
- [Data Flow](./DATA_FLOW.md)
