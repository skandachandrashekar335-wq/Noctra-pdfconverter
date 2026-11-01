# Production Deployment Checklist

Run through this checklist before every production deployment. All items must pass.

---

## Quality Gates

- [ ] **Tests pass:** `npm test` — all 335 tests passing, no failures
- [ ] **TypeScript clean:** `npx tsc --noEmit` — exits with code 0, no errors
- [ ] **Lint clean:** `npm run lint` — exits with code 0, no errors or warnings
- [ ] **Build succeeds:** `npm run build` — Next.js production build completes without errors

```bash
# Run all gates in sequence:
npm test && npx tsc --noEmit && npm run lint && npm run build
```

---

## Security Checks

- [ ] **No secrets in staged files:** `git diff --cached` contains no API keys, private keys, or passwords
- [ ] **`.env.local` is not tracked:** `git status` does not list `.env.local`
- [ ] **No `NEXT_PUBLIC_` secrets:** verify that Supabase keys, Firebase Admin keys, and AI keys are not prefixed with `NEXT_PUBLIC_`
- [ ] **Dependency audit:** `npm audit --production` — no high or critical vulnerabilities

---

## Environment Variables (Vercel Dashboard)

Confirm all required variables are set in the **Production** environment in Vercel:

- [ ] `NEXT_PUBLIC_FIREBASE_API_KEY`
- [ ] `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- [ ] `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- [ ] `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `NEXT_PUBLIC_FIREBASE_APP_ID`
- [ ] `FIREBASE_ADMIN_PROJECT_ID`
- [ ] `FIREBASE_ADMIN_CLIENT_EMAIL`
- [ ] `FIREBASE_ADMIN_PRIVATE_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] `GEMINI_API_KEY`
- [ ] `GEMINI_PRIMARY_MODEL`
- [ ] `OPENROUTER_API_KEY` (recommended for fallback)
- [ ] `OPENROUTER_MODEL`

---

## Post-Deploy Smoke Tests

After the deployment completes:

- [ ] **Landing page loads:** visit [https://noctra-pdfconverter.vercel.app](https://noctra-pdfconverter.vercel.app) — page renders without error
- [ ] **PDF conversion:** upload a test PDF, verify dark-mode conversion completes and download works
- [ ] **PPTX conversion:** upload a test PPTX, verify conversion and download
- [ ] **Sign-in:** Google Sign-In flow completes and the dashboard loads
- [ ] **History:** a completed conversion appears in the history list
- [ ] **AI Study:** a study task (e.g., summary) returns a valid response
- [ ] **Theme toggle:** dark/light/system theme switching works and persists

---

## Optional (Recommended for Major Releases)

- [ ] **Backend verification:** `npm run verify:backend` against production Supabase
- [ ] **Real-browser E2E:** `npm run test:e2e` (requires a local browser)
- [ ] **Lighthouse audit:** Lighthouse performance score ≥ 80 on the landing page

---

## Rollback Procedure

If any smoke test fails after deployment:

1. Go to Vercel Dashboard → Deployments
2. Find the previous successful deployment
3. Click **···** → **Promote to Production**
4. Re-run smoke tests to confirm rollback succeeded
5. File a bug report and do not re-deploy until the issue is fixed and tests pass

---

## Related Documentation

- [Vercel Deployment](./VERCEL_DEPLOYMENT.md)
- [Release Process](./RELEASE_PROCESS.md)
- [Testing](../development/TESTING.md)
