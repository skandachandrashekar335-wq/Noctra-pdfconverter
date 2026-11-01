# Privacy Architecture

Noctra is architected around the principle of user data minimization and local browser computation.

---

## 1. Data Classification Matrix

| Data Type | Storage Location | Retention Period | Transmission Scope |
| :--- | :--- | :--- | :--- |
| **Uploaded Documents (PDF, PPTX)** | Browser Memory / Blob URL | Cleared on tab close / reload | None (never leaves client device) |
| **Rendered Images & Canvases** | Client RAM | Ephemeral during conversion | None |
| **Extracted Study Passages** | Client RAM | User session | Sent to `/api/study` & AI Provider ONLY after explicit user consent |
| **User Profile (Email, Name)** | Firebase Auth | Account lifetime | Secure Firebase SDK Auth token |
| **Conversion History Metadata** | Supabase PostgreSQL | Account lifetime (deletable by user) | Server-side only via authenticated API |
| **Personal API Keys (BYOK)** | Browser `localStorage` | Until cleared by user | Client-to-server request headers only |

---

## 2. Document Processing Flow (Local)

```
[User Device]
  │
  ├── 1. Selects document file (File API)
  ├── 2. Parses pages/slides in Web Workers
  ├── 3. Performs color inversion & pixel adjustments in Canvas
  ├── 4. Composes output PDF / PPTX using pdf-lib / JSZip
  └── 5. Triggers browser download
```
*At no point in the conversion lifecycle is document data transmitted over the network.*

---

## 3. Study AI Pipeline (Consent-Gated)

```
[User Device]
  │
  ├── 1. User extracts passages locally
  ├── 2. User selects study task (Quiz, Flashcards, Summary)
  ├── 3. System presents Explicit Privacy & Consent Gate
  ├── 4. User affirms consent ("consent: true")
  ▼
[Noctra Server (/api/study)]
  │
  ├── 5. Validates rate limit & explicit consent flag
  ├── 6. Dispatches passages to Gemini / OpenRouter provider
  ▼
[External AI Provider (Google / OpenRouter)]
  │
  └── 7. Processes passages, returns structured pedagogical output
```

---

## 4. Account Deletion & Right to Erasure

- Users can trigger immediate, complete account deletion under **Settings → Delete Account**.
- The server route `/api/account/delete` permanently deletes the user's Firebase auth record and cascades deletion to all associated Supabase history records.
