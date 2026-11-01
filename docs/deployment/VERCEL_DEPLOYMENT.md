# Vercel Deployment

Noctra is deployed to [https://noctra-pdfconverter.vercel.app](https://noctra-pdfconverter.vercel.app) via Vercel, connected to the GitHub repository for automatic deployments.

---

## Automatic Deployment (Recommended)

The project is connected to GitHub. Every push to `main` triggers an automatic production deployment on Vercel.

```
git push origin main   # → Vercel automatically builds and deploys
```

Preview deployments are created for every pull request branch.

---

## Manual Deployment

If you need to deploy manually (e.g., from a local machine after re-linking the project):

### 1. Install the Vercel CLI

```bash
npm i -g vercel
```

### 2. Link the Project

> **Note:** `.vercel/project.json` is in `.gitignore`, so a fresh clone will not have the project link. You must re-link before deploying.

```bash
npx vercel link
# Follow the prompts:
# - Log in to Vercel
# - Select the "skandachandrashekar335" scope
# - Link to the existing "Noctra-pdfconverter" project
```

### 3. Deploy to Production

```bash
npx vercel --prod
```

---

## Environment Variables in Vercel

The `.env.local` file is **not** deployed — it is gitignored. All environment variables must be configured in the **Vercel dashboard**.

**Path:** Vercel Dashboard → Your Project → Settings → Environment Variables

Add each variable from the [Environment Variables reference](../development/ENVIRONMENT_VARIABLES.md), targeting the **Production** environment (and optionally Preview/Development).

### Critical variables for production

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` (6 vars) | Google Sign-In |
| `FIREBASE_ADMIN_PROJECT_ID` | API route auth verification |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Firebase Admin operations |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Firebase Admin operations |
| `SUPABASE_URL` | Conversion history |
| `SUPABASE_SECRET_KEY` | Conversion history |
| `GEMINI_API_KEY` | AI Study (Tier 1) |
| `GEMINI_PRIMARY_MODEL` | AI Study (Tier 1) |
| `OPENROUTER_API_KEY` | AI Study (Tier 3 fallback) |
| `OPENROUTER_MODEL` | AI Study (Tier 3 fallback) |

---

## Build Configuration

The project uses the default Next.js build output. No custom `vercel.json` is required for standard deployments. Vercel auto-detects Next.js and applies the correct build configuration.

### Build command
```
npm run build
```

### Output directory
Managed by Next.js/Vercel automatically (`.next/`).

### Node.js version
The `engines` field in `package.json` specifies `node: 24.x`. Configure this in **Vercel Dashboard → Settings → General → Node.js Version** to match.

---

## Rollback

To roll back to a previous deployment:

1. Go to Vercel Dashboard → Your Project → Deployments
2. Find the last known-good deployment
3. Click **···** → **Promote to Production**

Or use the CLI:
```bash
npx vercel rollback [deployment-url]
```

---

## Related Documentation

- [Production Checklist](./PRODUCTION_CHECKLIST.md)
- [Release Process](./RELEASE_PROCESS.md)
- [Environment Variables](../development/ENVIRONMENT_VARIABLES.md)
