# Noctra 3.0 — Cloud-First Development Workflow

This document describes how to develop, test, preview, and deploy Noctra entirely from a web browser without requiring a native development environment on your local machine.

---

## 1. Zero Native Prerequisites

You do **not** need:
- Local Node.js or npm installed on your Mac / PC
- Local Docker or container runtimes
- Local PostgreSQL or local Supabase CLI emulators
- Any `.env.local` file stored on your personal machine

The **GitHub repository is the single source of truth**. All development and testing can be conducted in hosted cloud environments:
- **Development & Coding:** GitHub Codespaces (or any devcontainer-compatible cloud IDE)
- **Database & Identity:** Hosted Supabase (PostgreSQL, Auth, Storage)
- **Deployment & Preview:** Vercel (Automatic preview deployments per branch/PR)

---

## 2. Developing in GitHub Codespaces

### Launching Codespaces
1. Navigate to the GitHub repository: `https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter`
2. Click **Code** > **Codespaces** tab > **Create codespace on main**.
3. Codespaces reads `.devcontainer/devcontainer.json` and automatically builds an isolated Linux container with **Node.js 24** pre-installed.
4. When the terminal opens, dependencies are installed automatically via `postCreateCommand: npm install`.

### Running the Development Server
Inside the Codespaces terminal:
```bash
npm run dev
```
Port `3000` is automatically forwarded. VS Code will pop up a notification with an **Open in Browser** link (`https://<codespace-name>-3000.app.github.dev`).

### Managing Environment Secrets in Codespaces
Do not commit secrets to Git. To configure backend secrets in Codespaces:
1. In GitHub, go to your repository **Settings** > **Secrets and variables** > **Codespaces**.
2. Add the required repository secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
   - `FIREBASE_ADMIN_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
3. Codespaces injects these directly into the container process environment.

---

## 3. Vercel Serverless Architecture & Execution Model

Noctra is deployed to Vercel's serverless edge infrastructure. Keep these architectural principles in mind:

1. **Stateless API Routes:**
   - Serverless functions are ephemeral. Instances freeze or terminate between requests.
   - Do not rely on in-memory Node.js global state for durable data.
   - Do not rely on long-running daemon background threads.

2. **No Persistent Local Filesystem:**
   - Document conversions for PDF, DOCX, and PPTX run **100% inside the client browser** using WebAssembly, PDF.js, and client-side memory buffers.
   - The server never writes user document files to disk.
   - Any server-side temporary buffers must use memory or `/tmp` with immediate cleanup.

3. **Database-Backed Rate Limiting & Storage:**
   - Rate limiting uses a persistent PostgreSQL table (`public.api_rate_limits`) with in-memory fallbacks to withstand serverless cold starts.
   - User conversion metadata and reader annotations are stored in Supabase PostgreSQL under strict Row Level Security.

---

## 4. Verification in Cloud Environments

Before creating a pull request or merging:
```bash
# Run unit and integration tests (260+ tests)
npm test

# Verify TypeScript types
npx tsc --noEmit

# Verify code linting
npm run lint

# Verify live backend connectivity & RLS policies
npm run verify:backend
```

Every PR automatically triggers a **Vercel Preview Deployment**, giving you a unique HTTPS preview URL to test the app in a real browser on desktop and mobile devices.
