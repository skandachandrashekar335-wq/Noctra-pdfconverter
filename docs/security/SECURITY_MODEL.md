# Security Model

This document outlines the security architecture and threat defenses implemented across the Noctra platform.

---

## 1. Core Architectural Tenets

### 1.1 Client-Side Processing Boundary
- **Zero Document Retention**: Document conversion for PDF and PPTX is executed in the user's browser using WebAssembly and Web Worker pipelines (`pdfjs-dist`, `pdf-lib`, and `jszip`).
- Raw files are never transmitted to, uploaded to, or stored on Noctra server infrastructure.

### 1.2 Explicit AI Consent Gateway
- Ingestion of document content into AI Study features requires explicit, affirmative user consent (`consent: true`).
- The user is fully informed that document excerpts are dispatched to third-party model providers (Gemini / OpenRouter).
- The consent flag is validated strictly on the server in `src/app/api/study/route.ts`. Requests omitting `consent: true` are rejected with HTTP 400.

---

## 2. Authentication & Authorization

### 2.1 Identity Verification
- Client authentication is powered by Firebase Authentication.
- Server-side routes requiring authenticated user context (`/api/history`, `/api/reader`) verify the incoming Firebase ID token using the Firebase Admin SDK (`verifyIdToken`).
- The caller's `uid` is extracted strictly from the cryptographically verified token; client-supplied `uid` parameters in request bodies are ignored.

### 2.2 Database Row-Level Security (RLS)
- Conversion history and persistent metadata are stored in Supabase PostgreSQL.
- Database access is isolated by `user_id` using strict Row-Level Security policies.
- Public client keys cannot read or write user history rows directly.

---

## 3. Credential Isolation & Secrets Management

- **No Public Leaks**: Server secrets (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_ADMIN_PRIVATE_KEY`) are never prefixed with `NEXT_PUBLIC_`.
- **Sanitized Diagnostics**: The AI Provider Engine sanitizes all provider exceptions. Upstream auth tokens, raw headers, and secret keys are never included in error responses or client payloads.
- **Client Bring-Your-Own-Key (BYOK)**: If a user configures a personal key in the UI, it is stored strictly in browser `localStorage` and passed only via request headers (`x-gemini-api-key`, `x-openrouter-api-key`). It is never written to server logs or persisted to databases.

---

## 4. Abuse Prevention & Rate Limiting

- All API routes are protected by IP and UID rate limiters implemented in `src/lib/server/rate-limiter.ts`.
- Requests exceeding allowed velocity return `HTTP 429 Too Many Requests` with standard rate limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
