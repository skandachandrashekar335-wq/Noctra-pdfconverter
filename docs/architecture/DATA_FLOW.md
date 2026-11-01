# Data Flow

This document traces the two primary data flows in Noctra: document conversion and AI study requests. Each flow has different privacy implications.

---

## Flow 1 — Document Conversion (Browser-Only)

This is the core privacy guarantee of Noctra. **Zero bytes of the user's document reach any server.**

```mermaid
sequenceDiagram
    participant User
    participant Browser as Browser\n(PDF.js / JSZip / pdf-lib)
    participant LocalMemory as Browser Memory\n(ArrayBuffer / Blob)

    User->>Browser: Select PDF or PPTX file
    Browser->>LocalMemory: Read file as ArrayBuffer (FileReader API)
    LocalMemory->>Browser: ArrayBuffer in memory
    Browser->>Browser: Render pages to OffscreenCanvas (PDF.js)
    Browser->>Browser: Apply Dark Sweep pixel transform
    Browser->>Browser: Compose output with pdf-lib / JSZip
    Browser->>Browser: Validate output structure
    Browser->>LocalMemory: Store output as Blob URL
    Browser->>User: Offer download / preview
    Note over Browser,LocalMemory: Nothing leaves the browser at any point
```

---

## Flow 2 — AI Study (Server-Assisted, Consent Required)

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant StudyAPI as /api/study\n(Next.js Route)
    participant FirebaseAdmin as Firebase Admin SDK
    participant AIProvider as AI Provider\n(Gemini / OpenRouter)

    User->>Browser: Click "Study this document"
    Browser->>User: Show consent dialog\n("This will send text to an AI provider")
    User->>Browser: Grant consent
    Browser->>Browser: Extract text from document\n(study-material-extractor.ts)
    Browser->>StudyAPI: POST /api/study\n{ task, passages[] }\nAuthorization: Bearer <Firebase JWT>\nX-Study-Consent: granted
    StudyAPI->>FirebaseAdmin: verifyIdToken(JWT)
    FirebaseAdmin-->>StudyAPI: { uid, email }
    StudyAPI->>StudyAPI: Check rate limit (per-UID)
    StudyAPI->>AIProvider: Call primary provider (Gemini)
    AIProvider-->>StudyAPI: AI response
    StudyAPI-->>Browser: { content, parsed, provider, fallbackOccurred }
    Browser->>User: Display study material
```

**What is sent to the AI provider:**
- Extracted text passages from the document
- The task type (e.g., `quiz`, `flashcards`)
- Optional context string

**What is NOT sent:**
- The original file bytes
- Images or rendered page data
- The user's email or UID

---

## Flow 3 — Conversion History (Optional, Authenticated Only)

History storage is opt-in (available only to signed-in users) and stores **metadata only** — not file content.

```mermaid
sequenceDiagram
    participant Browser
    participant HistoryAPI as /api/history\n(Next.js Route)
    participant FirebaseAdmin as Firebase Admin SDK
    participant Supabase

    Browser->>HistoryAPI: POST /api/history\n{ filename, fileType, pageCount, status }\nAuthorization: Bearer <Firebase JWT>
    HistoryAPI->>FirebaseAdmin: verifyIdToken(JWT)
    FirebaseAdmin-->>HistoryAPI: { uid }
    HistoryAPI->>Supabase: INSERT INTO conversions\n(user_id=uid, filename, file_type, page_count, status, created_at)
    Supabase-->>HistoryAPI: { id, created_at }
    HistoryAPI-->>Browser: { id, created_at }
```

**Data stored in Supabase (per conversion record):**

| Column | Example value | Notes |
|---|---|---|
| `user_id` | `firebase_uid_abc123` | From verified Firebase token |
| `filename` | `lecture-notes.pdf` | Original filename (user-controlled) |
| `file_type` | `pdf` | Input format |
| `page_count` | `42` | Extracted during conversion |
| `status` | `completed` | Lifecycle state |
| `created_at` | `2026-11-01T11:00:00Z` | Server timestamp |

**Not stored:** file bytes, rendered images, output PDFs, or extracted text.

---

## Data at Rest

| Data | Location | Retention |
|---|---|---|
| Converted file (output Blob) | Browser memory (Blob URL) | Until page unload or grace period expires |
| Conversion history metadata | Supabase | Until user deletes or requests account deletion |
| Firebase auth tokens | Firebase servers | Managed by Firebase; user can revoke via Google account |
| AI study responses | Not persisted | Returned in API response only; not stored |

---

## Related Documentation

- [System Overview](./SYSTEM_OVERVIEW.md)
- [Authentication](./AUTHENTICATION.md)
- [Privacy Architecture](../security/PRIVACY_ARCHITECTURE.md)
