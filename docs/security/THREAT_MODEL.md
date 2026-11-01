# Threat Model

This document outlines the threat analysis, attack vectors, and countermeasures implemented in Noctra.

---

## 1. Assets & Trust Boundaries

### 1.1 Assets
1. **User Documents**: Intellectual property, academic materials, and personal documents.
2. **AI Provider Credentials**: API keys for Gemini Primary, Gemini Secondary, and OpenRouter.
3. **Database Credentials**: Supabase service-role keys.
4. **User Sessions & History**: Stored conversion metadata and Firebase user IDs.

### 1.2 Trust Boundaries
- **Client (Untrusted)**: Browser runtime, user local storage, request payloads, and network headers.
- **Server API (Trusted Boundary)**: Next.js edge/serverless runtime, environment secrets, and rate limiters.
- **Database / Upstream (Protected)**: Supabase PostgreSQL, Firebase Auth, and Upstream AI APIs.

---

## 2. Threat Analysis & Mitigations

### 2.1 Threat: Document Exfiltration / Data Leakage
- **Risk**: A compromised server or third-party breach exposes user documents.
- **Mitigation**: Document conversion is strictly client-side. The server has no file storage, database blobs, or upload directories for source files. Document passages are only forwarded to AI providers with affirmative user consent.

### 2.2 Threat: Secret Exposure (API Keys & Service Role)
- **Risk**: API keys or service role secrets leaked in client bundles or public repositories.
- **Mitigation**:
  - Keys are stored in server-only environment variables.
  - Zero `NEXT_PUBLIC_` prefixes on secrets.
  - `.gitignore` prevents tracking `.env` or `.env*.local`.
  - Upstream errors are scrubbed by `ai-provider-engine.ts` to prevent key leakage in stack traces.

### 2.3 Threat: API Abuse & Denial of Service
- **Risk**: Malicious actors spamming `/api/study` to drain AI provider quotas.
- **Mitigation**:
  - In-memory rate limiting applied per IP and per authenticated user.
  - Strict payload validation rejecting ungrounded or oversized requests before dispatching to upstream providers.
  - Timeout protection (abort signal triggers after 28 seconds).

### 2.4 Threat: Unauthorized History Manipulation
- **Risk**: An attacker reading or deleting another user's conversion history.
- **Mitigation**:
  - Cryptographic validation of Firebase JWT ID tokens via the Firebase Admin SDK.
  - Supabase Row-Level Security ensures queries are constrained to the authenticated `auth.uid()`.
