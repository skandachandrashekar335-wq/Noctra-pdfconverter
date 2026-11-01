# Environment Variables Reference

All environment variables used by Noctra, their purpose, and where to obtain them.

> **Security rule:** Variables that contain secrets must **never** be prefixed with `NEXT_PUBLIC_`. The `NEXT_PUBLIC_` prefix bundles a variable into the browser JavaScript bundle, where it is publicly readable. Supabase service keys, Firebase Admin credentials, and all AI API keys must be server-side only.

---

## Firebase Authentication (Client — Public)

These are **public identifiers** bundled into the browser. They are not secrets. Firebase security is enforced by server-side token verification, not by hiding these values.

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | For auth | Firebase Web API key | Firebase Console → Project settings → Your apps → SDK config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | For auth | Firebase Auth domain (`<project>.firebaseapp.com`) | Same as above |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | For auth | Firebase project ID | Same as above |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | For auth | Firebase Storage bucket (`<project>.appspot.com`) | Same as above |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | For auth | Firebase Cloud Messaging sender ID | Same as above |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | For auth | Firebase App ID | Same as above |

If all `NEXT_PUBLIC_FIREBASE_*` variables are absent, the app builds and conversion works — sign-in and history are simply disabled.

---

## Firebase Admin SDK (Server — Secret)

Used by API routes to verify Firebase ID tokens server-side.

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `FIREBASE_ADMIN_PROJECT_ID` | For history/study auth | Must match the project that issued browser tokens | Firebase Console → Project settings → General |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Optional | Service account email; needed for admin operations beyond token verification | Firebase Console → Project settings → Service accounts → Generate new private key |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Optional | PEM-encoded private key. **Include newlines as `\n` in the value.** | Same as above |

> `FIREBASE_ADMIN_PROJECT_ID` alone is sufficient for `verifyIdToken()`. The client email and private key are only needed for operations that require admin SDK beyond token verification.

---

## Supabase (Server — Secret)

Used exclusively in Next.js API routes. The browser never connects to Supabase directly.

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | For history | Your Supabase project URL (`https://<ref>.supabase.co`) | Supabase Dashboard → Project Settings → API → Project URL |
| `SUPABASE_SECRET_KEY` | For history | Modern `sb_secret_…` service key (preferred) | Supabase Dashboard → Project Settings → API → Service role key |
| `SUPABASE_SERVICE_ROLE_KEY` | For history | Legacy `service_role` secret — use if your project predates `sb_secret_…` keys | Same location as above |
| `SUPABASE_ANON_KEY` | Optional | Public anon key — **only** used by `npm run verify:backend` to prove RLS denies public access. Never used by the app. | Supabase Dashboard → Project Settings → API → anon key |

> `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are mutually exclusive fallbacks — set whichever your project uses. A guard in `src/lib/supabase-config.ts` throws at startup if a `NEXT_PUBLIC_`-prefixed name is ever passed, preventing accidental secret exposure.

---

## Multi-Provider AI Study Fallback Engine (Server — Secret)

All AI credentials stay server-side. The engine tries providers in order: Gemini Primary → Gemini Secondary → OpenRouter Free.

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `GEMINI_API_KEY` | For AI Study (Tier 1) | API key for Gemini Primary | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GEMINI_PRIMARY_MODEL` | For AI Study (Tier 1) | Model ID, e.g. `gemini-3.5-flash` | [Gemini model docs](https://ai.google.dev/gemini-api/docs/models) |
| `GEMINI_SECONDARY_API_KEY` | For AI Study (Tier 2) | Separate API key for Gemini Secondary. If omitted and Tier 1 auth fails, Tier 2 is skipped. | Google AI Studio (separate key for redundancy) |
| `GEMINI_SECONDARY_MODEL` | For AI Study (Tier 2) | Secondary model ID, e.g. `gemini-flash-lite-latest` | Gemini model docs |
| `OPENROUTER_API_KEY` | For AI Study (Tier 3) | OpenRouter API key | [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL` | For AI Study (Tier 3) | OpenRouter model, e.g. `nvidia/nemotron-3.5-lightning:free` | [openrouter.ai/models](https://openrouter.ai/models) |
| `GEMINI_ALLOW_SHARED_KEY` | Optional | Set `true` to attempt Tier 2 even when it shares a key with Tier 1 that failed auth | N/A |

### Legacy OpenAI-Compatible Fallback (Optional)

| Variable | Required | Description |
|---|---|---|
| `NOCTRA_AI_BASE_URL` | Optional | Base URL of an OpenAI-compatible endpoint |
| `NOCTRA_AI_API_KEY` | Optional | API key for the endpoint |
| `NOCTRA_AI_MODEL` | Optional | Model ID |

---

## Minimum Configurations

### PDF/PPTX conversion only (no auth, no history, no AI)
```bash
# No env vars needed
```

### Add AI Study
```bash
GEMINI_API_KEY=your-gemini-key
GEMINI_PRIMARY_MODEL=gemini-3.5-flash
```

### Add Authentication
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
FIREBASE_ADMIN_PROJECT_ID=...
```

### Full feature set
See `.env.example` for the complete template.

---

## Related Documentation

- [Local Setup](./LOCAL_SETUP.md)
- [AI Provider Fallback](../architecture/AI_PROVIDER_FALLBACK.md)
- [Authentication](../architecture/AUTHENTICATION.md)
