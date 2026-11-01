# Privacy Policy

**Effective date**: 2026-11-01  
**Last updated**: 2026-11-01

Noctra is a browser-first document conversion and AI study platform available at [https://noctra-pdfconverter.vercel.app](https://noctra-pdfconverter.vercel.app).

This document explains what data Noctra collects, what stays on your device, and what is shared with third parties.

---

## 1. Document Conversion — Entirely Local

**PDF and PPTX files are processed entirely inside your browser.**

When you convert a document:
- The file is read by your browser using the Web File API
- The dark-mode transformation is applied locally using JavaScript (PDF.js + pdf-lib for PDF; JSZip for PPTX)
- The output file is generated in your browser and offered for download
- **No file bytes are transmitted to any server**
- No file content is stored by Noctra

This applies to all conversion features, including batch conversion.

---

## 2. AI Study — Text Sent to AI Providers With Consent

When you use the AI Study feature:

1. Noctra extracts text from your uploaded documents **locally in your browser**
2. You are shown a consent prompt before any text is sent anywhere
3. **Only after explicit consent**, the extracted text passages are sent to Noctra's server (`/api/study`), which forwards them to an AI provider

### AI Provider Sequence

Noctra uses a sequential fallback:

1. **Gemini Primary** (Google Gemini API, model: `gemini-3.5-flash`)
2. **Gemini Secondary** (Google Gemini API, model: `gemini-flash-lite-latest`)
3. **OpenRouter Free** (model: `nvidia/nemotron-3.5-lightning:free` or configured equivalent)

If the primary provider is unavailable, Noctra automatically tries the next in sequence. The response identifies which provider was used.

### What AI providers may receive

- Extracted text passages from your study documents
- The study objective (e.g., "Practice Quiz")
- Your question (for AI Teacher conversations)

### What AI providers do NOT receive

- Your raw file bytes
- Your account credentials
- Personal information beyond what is in the study text

### Third-party AI provider privacy

Your text is processed under the privacy policies of Google (Gemini) and OpenRouter. Noctra does not have zero-data-retention agreements with these providers. Do not submit documents containing sensitive personal data, medical records, financial information, or confidential business information.

---

## 3. Authentication

Authentication is handled by **Firebase Auth** (Google). When you create an account or sign in:
- Firebase stores your email, authentication tokens, and account identifiers
- Noctra's server verifies Firebase ID tokens to authorize history operations
- Noctra does not store your password (Firebase manages credential hashing)

---

## 4. Conversion History

For authenticated users, Noctra records conversion history in **Supabase**:
- File name
- File type
- Conversion status
- Timestamp

**File content is never stored.** History is scoped to your user account and protected by row-level security.

---

## 5. Local Storage

Noctra uses browser `localStorage` for:
- Theme preference (dark/light/system)
- Optional custom API key (if you configure Bring-Your-Own-Key)

These values remain on your device and are not transmitted to Noctra's servers.

---

## 6. Cookies and Tracking

Noctra does not use tracking cookies or analytics beyond what Vercel's hosting platform logs (standard server request logs including IP address and user-agent, retained per Vercel's privacy policy).

---

## 7. Data Deletion

To delete your account and all associated history data:
- Go to Dashboard → Settings → Delete Account
- All Supabase history records associated with your account are permanently deleted

---

## 8. Contact

For privacy questions, open an issue on [GitHub](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/issues) with the `privacy` label.

For security vulnerabilities, use [GitHub Security Advisories](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/security/advisories/new).

---

## 9. Changes to This Policy

This policy may be updated when the implementation changes. The effective date at the top of this document reflects the most recent revision. Continued use of Noctra after changes constitutes acceptance.
