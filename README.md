<p align="center">
  <img src="public/noctra-logo.png" alt="Noctra logo" width="112" />
</p>

<h1 align="center">Noctra</h1>

<p align="center">
  <strong>Give your documents the dark mode they deserve.</strong><br />
  A privacy-first document converter for comfortable reading, built for PDFs, Word documents and PowerPoint presentations.
</p>

<p align="center">
  <a href="https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/actions/workflows/ci.yml"><img src="https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Privacy--first-browser--side-success" alt="Privacy first browser-side processing" />
</p>

<p align="center">
  <a href="#what-noctra-does">Overview</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#features">Features</a> ·
  <a href="#local-setup">Setup</a> ·
  <a href="#security-model">Security</a>
</p>

---

## Screenshots

The following captures are committed project screenshots from the restored UI audit set.

| Convert | Library |
| --- | --- |
| ![Noctra conversion workspace](audit-screenshots/restored/1440x900-convert.png) | ![Noctra document library](audit-screenshots/restored/1440x900-library.png) |

| Settings | Study |
| --- | --- |
| ![Noctra settings](audit-screenshots/restored/1440x900-settings.png) | ![Noctra study workspace](audit-screenshots/restored/1440x900-study.png) |

---

# Noctra

> **Your documents were never designed for dark mode. Noctra was.**

Noctra converts bright study PDFs, Word documents and PowerPoint presentations into comfortable dark-mode versions — preserving text, diagrams, images, and structure where the format allows.

---

## What Noctra does

Students commonly study from documents with white backgrounds and black text. Late-night reading on bright screens causes eye strain. Noctra transforms those documents so they're comfortable in the dark:

- **PDF** files are rendered page-by-page, transformed with an intelligent pixel-level algorithm, and re-assembled into a downloadable PDF
- **PPTX** files are patched structurally (XML-level) — slides remain fully editable in PowerPoint after conversion
- **DOCX** files are patched structurally (OOXML-level) — text, styles, relationships, equations and original media remain editable where supported

**Noctra does NOT simply invert every pixel.** Text, backgrounds, and low-saturation shapes are remapped to a dark palette. Photographs, diagrams, charts, and screenshots are preserved (only slightly dimmed) so they stay visually useful.

---

## Features

- 🌙 Intelligent dark-mode conversion for PDF, DOCX and PPTX
- 🔒 Firebase Google authentication
- 📁 Drag-and-drop upload with real-time progress
- 🗂️ Bounded batch conversion (PDF, DOCX and PPTX) with per-file status and ZIP export
- 🎛️ Opt-in conversion profiles: OLED Black, Charcoal Dark, Warm Sepia and Low-Contrast Night
- 📊 Measured OLED quality report after each PDF conversion (real pixel-classification counts, never estimates)
- 🩺 Copyable per-conversion diagnostics (file info, phase timings, environment facts) — shown only on demand, never uploaded
- 📜 Conversion history dashboard (stored in Supabase, scoped to your account)
- 🔎 Search, filter, sort, select and owner-scoped delete history records
- 📖 Built-in PDF reader with thumbnails, search, zoom, themes and keyboard navigation
- 🌓 Actual before/after PDF preview using the original and converted in-memory files
- 🔖 Owner-scoped reader bookmarks, notes and text highlights
- 🏷️ Persistent favourites and tags for history metadata
- ⏹️ Batch cancellation with retryable failed/cancelled items
- 🧠 All processing runs in your browser — documents never leave your device
- 🎨 Smooth animations (Anime.js v4) with reduced-motion support
- 📱 Responsive design

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + CSS variables |
| Animation | Anime.js v4 |
| Authentication | Firebase Authentication (Google) |
| Database | Supabase (PostgreSQL), reached via Next.js route handlers |
| PDF rendering | PDF.js (pdfjs-dist) |
| PDF generation | pdf-lib |
| OOXML parsing | JSZip |
| Deployment | Vercel |

Authentication and storage are deliberately separate: **Firebase identifies the
user, Supabase stores their history.** The browser never talks to Supabase —
it calls `/api/history`, which verifies the Firebase ID token and only then
uses a server-only Supabase key. See [Security model](#security-model).

---

## Local setup

### Prerequisites

- Node.js 20+
- npm 10+
- A Firebase project (see below)
- A Supabase project (see below)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd Noctra-pdfconverter
npm install
```

### 2. Set up Firebase (authentication only)

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. In **Authentication → Sign-in method**, enable **Google**
3. In **Project Settings → Your apps**, add a **Web app** and copy the config
4. In **Project Settings → Service Accounts**, click **Generate new private key** and download the JSON

No Firestore database is needed — Firebase is used for **authentication only** in this
app. See [Legacy Firestore files](#legacy-firestore-files) if you are coming from an
older version.

### 3. Set up Google Authentication

In Firebase Console → Authentication → Sign-in method → Google:
- Enable Google sign-in
- Add your domain to the **Authorized domains** list (for local dev, `localhost` is already included)

### 4. Create the Supabase project and apply the schema

1. Go to [supabase.com](https://supabase.com) → **New project** and note the database password
2. Open **SQL Editor** → **New query**
3. For a new project, paste and run
   [`supabase/migrations/0001_conversions.sql`](./supabase/migrations/0001_conversions.sql).
   For an existing Noctra database, run
   [`supabase/migrations/0002_add_docx_file_type.sql`](./supabase/migrations/0002_add_docx_file_type.sql)
   after `0001` to add DOCX history rows.
   Apply [`supabase/migrations/0003_reader_and_organization.sql`](./supabase/migrations/0003_reader_and_organization.sql)
   and [`supabase/migrations/0004_add_cancelled_status.sql`](./supabase/migrations/0004_add_cancelled_status.sql)
   after those migrations for reader metadata, organization fields and cancelled
   batch statuses.

Those migrations create/update the `conversions` table, reader metadata tables, their indexes, **row level security**,
the restrictive policy that pins tokens to this Firebase project, and the `REVOKE`
statements. Nothing else needs to be applied.

> Prefer the CLI? From the project directory run
> `supabase db push --project-ref <your-project-ref>` after
> `supabase init` (once).

Verify it worked: **Table Editor** should list `conversions`, and **Authentication →
Policies** should show row level security **enabled** on it. Confirm the two `REVOKE`
statements took effect by checking that `anon` and `authenticated` have no grants.

### 5. Environment variables

Copy the template and fill in your values:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Firebase Web App config (from Project Settings → Your apps)
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc...

# Firebase Admin SDK — server only, verifies the ID token on /api/history.
# FIREBASE_ADMIN_PROJECT_ID must match the project that issues the tokens.
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Supabase — server only. NEVER prefix with NEXT_PUBLIC_.
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
# Legacy fallback for older projects:
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
```


If any `NEXT_PUBLIC_FIREBASE_*` value is missing or blank, the app still builds and the
landing page still renders: Google sign-in is disabled and `/dashboard` shows a
**"Configuration required"** message naming the exact variables, instead of crashing.

If `SUPABASE_URL` and both server-key options are missing, everything still works —
only **saved history** is unavailable, and the UI says exactly that instead of claiming
the conversion failed.

The optional study assistant uses `NOCTRA_AI_BASE_URL`, `NOCTRA_AI_API_KEY` and
`NOCTRA_AI_MODEL` on the server only. It is disabled when those values are absent.
The API requires explicit consent and receives only selected source passages; it does
not silently upload an entire document. No provider is included or paid for by default.

DOCX conversion is structural and keeps the `.docx` package editable. This browser
path does not export DOCX or PPTX to PDF because reliable Office pagination requires
LibreOffice/Microsoft Office or a separately secured worker. Do not label a structural
DOCX/PPTX result as a PDF export.

### Conversion profiles and batch processing

The existing OLED Black output remains the default. The dashboard also offers
optional profiles for Charcoal Dark, Warm Sepia and Low-Contrast Night, in both the
single-file drop zone and the batch workspace. Profiles are passed into the
format-specific conversion pipeline, so the PDF pixel transform and the editable
DOCX/PPTX XML transforms use the same selected palette. A profile applies to the
next conversion only — changing the picker never restyles a file that already
finished, and the default OLED Black output remains byte-stable.

The Batch workspace accepts up to 20 files and processes at most two concurrently.
Each file has its own queue/progress/result state, successful files can be downloaded
individually, and completed results can be packaged into a ZIP. Each batch conversion
uses the same best-effort history tracker as single-file conversion; the current batch
screen does not live-refresh the separate Recent conversions list after the batch ends,
so reload the dashboard to see those newly written rows.

### Reader and document metadata

The single-file PDF result can be opened in the built-in reader. It supports page
navigation, thumbnails, fit-to-width, zoom, text search, full-screen mode, keyboard
navigation, reading themes, bookmarks, notes and text highlights. Reader metadata is
keyed by a SHA-256 hash of the locally opened output and stored in Supabase only after
the authenticated API route verifies the Firebase user.

Converted binaries remain in browser memory only. A history row does not imply that the
source or output can be reopened after the browser session ends. If a PDF page contains
no extracted text, Noctra reports that OCR is unavailable in this browser build instead
of claiming that a scan was made searchable.

For PDF conversions, the completed state also shows a side-by-side browser preview of
the original and transformed files. DOCX and PPTX remain editable structural outputs;
their reliable Office pagination is not fabricated in the browser preview.

#### Configuring Firebase token verification

`/api/history` calls `verifyIdToken()` from the Firebase Admin SDK. Two things must be
true or **every request is rejected with 401**:

1. **`FIREBASE_ADMIN_PROJECT_ID` must equal the project that issues the tokens.**
   `verifyIdToken()` checks the token's `aud` claim against the configured project ID —
   a mismatch (for example credentials left over from a different project) fails
   every verification.
2. If `FIREBASE_ADMIN_CLIENT_EMAIL` and `FIREBASE_ADMIN_PRIVATE_KEY` are set, they must
   belong to that same project. Neither is strictly required for *verification* alone
   (the SDK can fall back to Google's public certificates), but a **wrong** key is worse
   than an absent one.

Never expose `FIREBASE_ADMIN_*`, `SUPABASE_SECRET_KEY`, or
`SUPABASE_SERVICE_ROLE_KEY` to the browser. Never
prefix them with `NEXT_PUBLIC_` — a guard in `src/lib/supabase-config.ts` throws at
startup if a `NEXT_PUBLIC_`-prefixed name is ever handed to it, and a test in
`tests/supabase-schema.test.ts` fails the build if any client module reads one.

#### Verify the backend for real

The unit tests prove the code's *intent* using injected stubs. Once your credentials are
in `.env.local`, run this to prove the *deployment* actually works — it talks to your
live Supabase project and Firebase, and it never writes to your database:

```bash
npm run verify:backend

# Also exercise insert / UID-scoping / cleanup against the live table:
npm run verify:backend -- --write
```

It checks, in order: that every server-only variable is present and not still a
placeholder from `.env.example`; that no `NEXT_PUBLIC_` variable could leak a Supabase
secret; that the **Firebase service-account key actually parses and verifies tokens**
(the most common blocker — a stale or one-line-mangled key makes every history request
return 503); that the `conversions` table exists with every column the app reads (i.e.
the migration ran); and, if you also set `SUPABASE_ANON_KEY`, that the public key is
denied by row level security rather than merely assumed to be.

Each failure prints the specific fix. Exit code `0` means the backend is live.

### 6. Authentication setup (localhost and production)

In Firebase Console → Authentication → Sign-in method, **enable Google**.

In Firebase Console → Authentication → Settings → **Authorized domains**, make sure these are listed:

| Environment | Domain to authorize |
| --- | --- |
| Local development | `localhost` (present by default) |
| Vercel preview/production | your `<project>.vercel.app` domain |
| Custom domain | e.g. `noctra.example.com` |

The sign-in popup is rejected with `auth/unauthorized-domain` (shown as a friendly
message) if the domain is missing. Env vars belong to the *deployment*, so make sure the
`.env.local` you're running (and the Vercel variables) point at the same Firebase project
and the same Supabase project.

#### Manual verification with two test accounts

Live Google Sign-In cannot be automated (it needs an interactive Google login), so
verify manually:

1. Start the app (`npm run dev`), open it in Browser A, and sign in with **test account 1**.
2. Confirm you land on `/dashboard`, your name/avatar appear (derived from the Google
   session — no profile record is stored), and the history list shows only account 1's
   records.
3. Convert a file — the record appears in History.
4. Open a **private/incognito window** in Browser A (or a different browser) and sign in
   with **test account 2**.
5. Confirm account 2's History is **empty** — account 1's conversion must not be visible.
   Then verify isolation at the storage layer too (see
   [Testing access isolation between two users](#testing-access-isolation-between-two-users)).
6. Sign out from account 2's dashboard → you are returned to the landing page; reloading
   `/dashboard` redirects back to `/` (session cleared).
7. Reload the landing page while signed in as account 1 in Browser A → the public landing
   page remains at `/` (the session persists, and the visible sign-in CTA changes to the
   signed-in dashboard action).
8. Popup checks: open the sign-in popup and close it → no error appears (silent). Block
   popups for the site → a "browser blocked the sign-in popup" message appears.

#### Testing access isolation between two users

Automated tests cover the *logic* (`tests/history-handlers.test.ts` proves a verified
token only ever reaches its own rows, and that a smuggled `user_uid` in the body is
ignored). They run against injected stubs, so they **do not** prove the deployed
database enforces it. Verify that live, once, with two accounts:

**A. Through the app (end-to end)**

1. Sign in as **account 1**, convert a file, and note the record appears.
2. In a private window, sign in as **account 2** → History must be empty.
3. With account 2 active, open DevTools → Network, find the `GET /api/history` request
   and copy its `Authorization` header. In a console tab run:

   ```js
   fetch("/api/history", { headers: { Authorization: "Bearer <paste token>" } })
     .then(r => r.json()).then(console.log)
   ```

   It must return only account 2's (empty) list — never account 1's row.

**B. At the database (proves RLS, not just the app)**

4. Supabase Dashboard → **Table Editor** → `conversions`. Confirm **RLS is ON** and that
   `anon` / `authenticated` show **no policies** granting them access.
5. In the **SQL Editor**, confirm the revokes took effect:

   ```sql
   select grantee, privilege_type from information_schema.role_table_grants
   where table_name = 'conversions';
   ```

   `anon` should be absent. The only writer is the service role, reachable solely
   through `/api/history`.

**C. Attack attempts (must all fail)**

6. **No token:** DevTools → Network → `GET /api/history` → Remove the `Authorization`
   header → **Replay**. Expect `401`, not the list.
7. **Forged uid in the body:** `POST /api/history` with body
   `{"originalFileName":"x.pdf","originalFileSize":1,"fileType":"pdf","clientRef":"<any uuid>","user_uid":"<account 1 uid>"}`
   while signed in as account 2. Then reload account 1's dashboard — **no new record**.
   The owner comes from the token, never the body.
8. **Tampered token:** edit one character of the JWT payload and Replay → `401`.
9. **Expired token:** in the console run `localStorage` is irrelevant (Firebase manages
   its own), so instead wait for an idle session or force it with
   `auth.currentUser.getIdToken(true)` after revoking the token in
   Firebase Console → Authentication → Users → *⋮* → **Revoke refresh token**. The next
   request must return `401` with a re-sign-in message.

> **Honest scope:** steps 1–9 are a manual procedure. Until they have been run against a
> live Supabase project with real Google accounts, live access isolation is **unverified**
> — the automated tests only establish the code's intent.

### 7. Development commands

```bash
# Start development server (with Turbopack)
npm run dev

# Type check
npx tsc --noEmit

# Production build
npm run build

# Start production server locally
npm start

# Lint
npm run lint

# Unit tests (Node 22.6+ required — uses the built-in `node --test`
# runner with native TypeScript type stripping; no extra dependencies)
npm test

# Verify the live backend (Supabase schema + RLS + Firebase token
# verification) against real credentials. Read-only by default.
npm run verify:backend
npm run verify:backend -- --write   # also test insert / UID scoping
```

Open [http://localhost:3000](http://localhost:3000).

### Managing the dev server (port 3000)

Noctra runs **one** development server on port 3000. If the URL already loads
before you run `npm run dev`, a previous instance is still alive — typically
because it was launched in the background (e.g. `nohup npm run dev &` or a
closed terminal that didn't kill the child), which orphans it to `init` so it
outlives the shell that started it.

**Check what's running** (read-only, safe to run anytime):

```bash
# Who owns port 3000, and from which directory?
lsof -nP -iTCP:3000 -sTCP:LISTEN

# Confirm it's this repo's dev server (not another project or a prod build)
lsof -a -p <PID> -d cwd        # cwd should be .../Noctra-pdfconverter
```

**Start:** run `npm run dev` from the repository root. If port 3000 is already
held by a *stale* Noctra dev server, stop it first (below) — don't start a
second one, or the two will fight over the port.

**Stop safely** (terminate only the verified Noctra dev process — never
`killall node`, which would take down every Node project on the machine):

```bash
# Graceful: stop the npm parent and its next dev child
kill <npm-run-dev-PID>          # the `npm run dev` process
# or target the listener directly:
kill <next-server-PID>
```

Confirm it's gone with `lsof -nP -iTCP:3000 -sTCP:LISTEN` (should return
nothing). Then `npm run dev` will start fresh from the current working tree.

**Dev vs. production build:** `next dev` compiles from source into `.next/dev/`
and serves live code — it does **not** use the `.next/` production output that
`npm run build` writes. A leftover production `BUILD_ID` in `.next/` therefore
never shadows your running dev server. Use `npm start` only to preview a
production build, and never run it while the dev server holds port 3000.

---

## Production deployment to Vercel

### Option A: Vercel dashboard

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → Import Project → select your repo
3. Go to Project → **Settings → Environment Variables** and add **every** variable from
   `.env.local` — both the `NEXT_PUBLIC_FIREBASE_*` set and the server-only ones:

   | Variable | Where it comes from |
   | --- | --- |
   | `NEXT_PUBLIC_FIREBASE_*` (6) | Firebase Console → Project Settings → Your apps |
   | `FIREBASE_ADMIN_PROJECT_ID` | service-account JSON, `project_id` |
   | `FIREBASE_ADMIN_CLIENT_EMAIL` | service-account JSON, `client_email` |
   | `FIREBASE_ADMIN_PRIVATE_KEY` | service-account JSON, `private_key` |
   | `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
    | `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → secret key (preferred) |
    | `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback: Supabase → Project Settings → API → `service_role` |

   The three `FIREBASE_ADMIN_*` and two `SUPABASE_*` variables are **server-only**. Vercel
   exposes anything prefixed `NEXT_PUBLIC_` to the browser bundle at build time, so never
   rename them with that prefix.
4. Apply `supabase/migrations/0001_conversions.sql` to the **production** Supabase project
   (the same migration runs for local and production; they are separate databases).
5. Deploy — Vercel auto-detects Next.js

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Add your production domain to Firebase

After deploying, go to Firebase Console → Authentication → Authorized domains and add your Vercel domain (e.g. `noctra.vercel.app`).

---

## Architecture notes

### Why browser-side processing?

Vercel serverless functions have a **10-second timeout** and a **4 MB request body limit** on the Hobby plan — both too small for real document conversion. By running PDF.js and JSZip directly in the user's browser:

- No timeout constraints
- Documents never leave the user's device (privacy benefit)
- No server costs for compute

History writes (creating/updating conversion records) go through our own
`/api/history` route handlers, which verify the Firebase ID token server-side before
touching Supabase. Conversion itself needs no network at all.

### Security model

**A client-provided Firebase UID is never trusted.** Every `/api/history` request must
carry `Authorization: Bearer <Firebase ID token>`; the server derives the owner from the
*verified token* and ignores anything in the request body.

```
Browser ── ID token ──▶ /api/history ── verifyIdToken() ──▶ verified UID
                            │
                            ▼
                     server-only key ──▶ Supabase (Postgres)
                    every query filtered by user_uid = <verified UID>
```

Why this shape rather than having the browser talk to Supabase directly:

| | Server-side verification (chosen) | Supabase Third-Party Auth |
| --- | --- | --- |
| Extra infrastructure | none | Cloud Function to set a `role: 'authenticated'` claim on **every** Firebase user, plus a backfill for existing ones |
| Supabase credentials in the browser | none — no public Supabase variable exists | publishable key + JWT config |
| Where ownership is enforced | the route handler, from the verified token | RLS, from the JWT claim |
| Failure mode if misconfigured | 503 + conversions still work | silent `anon` role → empty history with no obvious cause |

Supabase Third-Party Auth *is* officially supported and is a reasonable choice if you
want RLS to be the enforcement point; it just carries the custom-claim overhead above.

**Row level security stays enabled regardless.** The server key bypasses RLS by
design, so the route handlers are what enforce ownership — but RLS being on with *no
permissive policy* for `anon` or `authenticated` means a leaked publishable key reads
zero rows. The migration also adds a **restrictive** policy pinning `iss`/`aud` to this
Firebase project (Firebase signs with one shared key set across all projects) and
explicitly `REVOKE`s both roles.

Three independent guards keep the Supabase server key server-side:

1. `src/lib/supabase-config.ts` throws at startup if a `NEXT_PUBLIC_`-prefixed name is
   ever passed to it.
2. Only server-side configuration/storage modules may name `SUPABASE_SECRET_KEY` or
   `SUPABASE_SERVICE_ROLE_KEY`.
3. `tests/supabase-schema.test.ts` fails the build if any client module references them, or
   if any code reads a `NEXT_PUBLIC_…SUPABASE…` variable.

### Resilient history writes

Conversion must never depend on storage being available. `history-tracker.ts` starts the
record in the background, queues status writes behind it, flushes late-arriving ids in
order, and skips queued writes if creation failed — nothing ever rejects or blocks.

If history *does* fail, the UI reports it through `onHistoryError` as a calm note on the
otherwise-successful download, never as a conversion failure. A `503` (Supabase not
configured on this deploy) is remembered so later conversions stop retrying a deployment
that was never set up.

### Legacy Firestore files

`firestore.rules`, `firestore.indexes.json` and `tests/firestore-rules.test.ts` are
**legacy and unused**. The app no longer imports `firebase/firestore` anywhere, and no
Firestore database is required.

They are kept deliberately: they are harmless, and the migration's own guidance is to
remove Firestore-specific configuration only after the Supabase replacement has been
verified against a live project. Once you have confirmed history works end-to-end, delete
all three together.

### PPTX conversion quality

PPTX conversion is structural (XML-patching), which means:

- ✅ Output is a valid, editable `.pptx` file
- ✅ Text, fonts, and positioning are perfectly preserved
- ✅ Themes, slide masters, layouts, charts, and speaker notes are all patched
- ⚠️ Very complex gradients may not transform perfectly (white/black stops are handled)
- ⚠️ Theme inheritance can be inconsistent across different PowerPoint templates
- ⚠️ SmartArt and WordArt elements are partially supported

For best results, test with standard lecture slide templates.

### PDF conversion quality

PDF conversion rasterises each page at 2× resolution using PDF.js, applies the dark transform, then re-assembles into a PDF using pdf-lib:

- ✅ All visual content is preserved
- ✅ Good quality at 92% JPEG compression
- ✅ Text is preserved as an invisible layer — output remains searchable,
  selectable and copy-pasteable, and screen readers can read it
- ✅ Hyperlinks (http/https/mailto and internal page jumps) are preserved as
  clickable link annotations
- ⚠️ File size will typically be larger than the original

The invisible text layer uses a substitute font (Helvetica/WinAnsi), so:

- ⚠️ CJK, emoji and other non-WinAnsi characters are omitted from the text
  layer (the visible raster still shows them)
- ⚠️ Selection highlighting can be slightly wider/narrower than the original
  glyphs because advance widths are approximated and scaled, not measured
  from the original embedded fonts
- ⚠️ Only link annotations are re-created; comments, highlights, form fields
  and other annotation types are not carried over

A future version could use a PDF editing library that preserves text as vectors.

---

## Known limitations

- Large PDFs (50+ pages) may take 30–60 seconds in the browser
- DOCX is supported as an editable structural transform; complex DrawingML effects and Word-specific rendering edge cases may need manual touch-up
- Very complex gradients in PPTX may not convert correctly (common white/black
  gradient stops are now transformed)
- PDF text is preserved via an invisible Helvetica layer: non-WinAnsi scripts
  (CJK, emoji) are not searchable in the output, and link rectangles are
  approximations of the originals
- The original Unit IV source PDF was not available in this workspace. A synthetic
  anti-aliased neutral-text regression fixture now guards the transform thresholds;
  the real source-document visual comparison remains a manual follow-up.
- The PPTX engine covers common slide structures; edge cases in complex templates may need manual touch-up
- PDF.js schedules page drawing with `requestAnimationFrame`, so an in-progress
  PDF conversion **pauses while the tab is in the background** and resumes when
  the tab becomes visible again (PPTX conversion is unaffected)
- History is fetched on mount and refetched when a conversion settles, rather
  than pushed live; a row may lag by a moment while a conversion is in flight
- Batch conversion outputs are browser-memory-only; the metadata history rows do not
  retain the converted binaries and may require a dashboard reload after a batch
- Reader metadata does not retain document binaries; reopening after a browser restart
  requires converting/opening the document again
- OCR is detection-only in this build: scanned pages are identified, but no paid or
  remote OCR service is invoked
- The study assistant API is an optional, consent-gated OpenAI-compatible adapter;
  with no provider settings it returns a truthful unavailable state
- Live Google sign-in and live Supabase isolation are **not** covered by the
  automated suite — see the manual procedures above

---

## Project structure

```
src/
├── app/
│   ├── api/history/route.ts   # GET/POST — verifies the Firebase ID token
│   ├── api/history/[id]/route.ts # PATCH — owner-scoped status updates
│   ├── api/reader/route.ts    # Reader preferences + annotations
│   ├── api/reader/[id]/route.ts # Owner-scoped annotation deletion
│   ├── api/study/route.ts     # Optional consent-gated study provider
│   ├── dashboard/page.tsx    # Protected dashboard
│   ├── globals.css           # Design tokens + utility classes
│   ├── layout.tsx            # Root layout with AuthProvider
│   └── page.tsx              # Landing page
├── components/
│   ├── BatchUploadZone.tsx    # Bounded multi-file conversion + ZIP export
│   ├── PDFReader.tsx          # PDF.js reader, search and study annotations
│   ├── AuthGuard.tsx         # Redirect-to-home wrapper
│   ├── ConversionList.tsx    # Authenticated history fetch (keyed by uid)
│   ├── GoogleSignInButton.tsx
│   └── UploadZone.tsx        # Drag-drop upload + conversion UI
├── hooks/
│   └── useAuth.tsx           # Firebase auth context + Google sign-in
├── lib/
│   ├── access-control.ts     # Pure auth / data-isolation helpers (unit tested)
│   ├── auth-token.ts         # Bearer parsing + token-error classification (unit tested)
│   ├── conversion.ts         # Browser-side conversion orchestrator
│   ├── conversion-profiles.ts # Shared opt-in dark palettes
│   ├── document-key.ts        # SHA-256 identity for local documents
│   ├── firebase-admin.ts     # Server-side Admin SDK: verifyIdToken()
│   ├── firebase.ts           # Client-side Firebase Auth (no Firestore)
│   ├── history-api.ts        # Client history store → /api/history
│   ├── history-row.ts        # Row mapping + input whitelists (unit tested)
│   ├── history-tracker.ts    # Non-blocking, ordered history writer (unit tested)
│   ├── ocr.ts                 # Scanned-page detection and honest OCR boundary
│   ├── reader-api.ts          # Authenticated reader metadata transport
│   ├── ai-study.ts            # Optional study provider validation/adapter
│   ├── pdf-converter.ts      # PDF dark-mode engine (PDF.js + pdf-lib)
│   ├── docx-converter.ts     # DOCX dark-mode engine (JSZip + OOXML)
│   ├── pptx-converter.ts     # PPTX dark-mode engine (JSZip + XML)
│   ├── supabase-config.ts    # Server-only config guard (unit tested)
│   ├── validation.ts         # Pure file validation helpers (unit tested)
│   ├── server/
│   │   ├── history-handlers.ts # Route logic with injectable deps (unit tested)
│   │   ├── history-store.ts    # Supabase service-role client, uid-scoped
│   │   ├── reader-handlers.ts  # Reader auth and request validation
│   │   └── reader-store.ts     # Reader metadata Supabase store
│   └── stubs/                # Browser stubs for Node-only packages
└── types/
    └── index.ts              # Shared TypeScript types
tests/
├── access-control.test.ts    # Profile whitelist + ownership checks
├── auth-errors.test.ts       # Auth error classification
├── conversion-no-block.test.ts # Source-level guard: no blocking history awaits
├── dark-transform.test.ts    # Pixel transform: paper/ink/colour preservation
├── history-handlers.test.ts  # Auth, cross-user denial, token rejection
├── reader-handlers.test.ts   # Reader ownership and validation boundaries
├── ai-study.test.ts          # Provider configuration and input limits
├── ocr.test.ts               # Scanned-page detection boundary
├── history-row.test.ts       # Row mapping, whitelists, ordered updates
├── history-tracker.test.ts   # Queued writes flush in order; failures don't throw
├── pdf-converter.test.ts     # Invalid PDF input + no-third-party-CDN guard
├── pptx-converter.test.ts    # Synthetic PPTX fixture → XML assertions
├── docx-converter.test.ts    # Synthetic DOCX fixture → OOXML assertions
├── run-conversion.integration.test.ts # Hang/failure must not block conversion
├── supabase-schema.test.ts   # RLS + no-secrets-in-browser invariants
└── validation.test.ts        # Type/size/extension validation
supabase/migrations/0001_conversions.sql # Schema, indexes, RLS, revokes
firestore.rules               # LEGACY, unused (see “Legacy Firestore files”)
firestore.indexes.json        # LEGACY, unused
```
