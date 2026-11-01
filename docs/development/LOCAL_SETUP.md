# Local Development Setup

This guide gets a full Noctra development environment running on your machine in under 10 minutes.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **24.x** | Required by the `engines` field in `package.json`. Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions. |
| **npm** | Bundled with Node 24 | The project uses `package-lock.json`; do **not** use `yarn` or `pnpm`. |
| **Git** | Any recent version | |

Verify your Node version:

```bash
node -v   # should print v24.x.x
```

---

## 1. Clone and Install

```bash
git clone https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter.git
cd Noctra-pdfconverter
npm ci          # installs exact versions from package-lock.json
```

---

## 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the values you need. See the full variable reference in [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md).

> **What works without any env vars:**
>
> - ✅ PDF dark-mode conversion (fully browser-side)
> - ✅ PPTX dark-mode conversion (fully browser-side)
> - ✅ File preview and download
>
> **What requires configuration:**
>
> - ⚙️ **AI Study** — requires at least one of `GEMINI_API_KEY` or `OPENROUTER_API_KEY`
> - ⚙️ **Google Sign-In** — requires `NEXT_PUBLIC_FIREBASE_*` variables
> - ⚙️ **Conversion history** — requires `SUPABASE_URL` + `SUPABASE_SECRET_KEY` and Firebase auth

---

## 3. Configure Firebase (optional — for auth)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a project (or use an existing one)
3. Add a **Web app** to the project
4. Copy the SDK configuration into `.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

5. For server-side token verification, go to **Project settings → Service accounts → Generate new private key** and add:

```
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 4. Configure Supabase (optional — for history)

1. Go to [supabase.com](https://supabase.com) and create a project
2. In **Project Settings → API**, copy:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

3. Apply the database migrations:

```bash
# Using the Supabase CLI:
supabase db push

# Or manually in the Supabase SQL editor,
# run the files in supabase/migrations/ in order:
# 0001_conversions.sql
# 0002_add_docx_file_type.sql
```

> **Note:** Migrations `0003` and `0004` exist in the repo but are **not applied to the production database**. Apply them only after verifying they are safe in your local/staging environment.

---

## 5. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 6. Verify the Test Suite

```bash
npm test
```

You should see **335 tests passing across 86 suites**. If tests fail, check that Node 24 is active.

```bash
npx tsc --noEmit   # TypeScript type check
npm run lint       # ESLint
npm run build      # Production build check
```

---

## Useful Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Next.js dev server with hot reload |
| `npm test` | Run all unit tests |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Real-browser PDF/PPTX conversion smoke test |
| `npm run verify:backend` | Verify Supabase RLS and API health |

---

## Troubleshooting

**`ERR_REQUIRE_ESM` on API routes** — Ensure you are running Node 24. Older Node versions may not handle the ESM configuration correctly.

**Firebase `auth/invalid-api-key`** — Double-check that `NEXT_PUBLIC_FIREBASE_API_KEY` is set and the Firebase project is active.

**Supabase 403 errors** — Ensure `SUPABASE_SECRET_KEY` (not the anon key) is set in `.env.local`.

**AI Study returns 503** — No AI provider is configured. Add at least one of `GEMINI_API_KEY` or `OPENROUTER_API_KEY`.

---

## Related Documentation

- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Testing](./TESTING.md)
- [System Overview](../architecture/SYSTEM_OVERVIEW.md)
