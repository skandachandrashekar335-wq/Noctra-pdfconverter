# Noctra 3.0 — Release & Recovery Runbook

This runbook outlines the required pre-release verification, deployment procedures, incident response, and rollback protocols for Noctra.

---

## 1. Pre-Release Verification Protocol

Before merging any pull request or deploying to production, execute this complete quality gate:

```bash
# 1. Full unit & integration test suite (260+ tests)
npm test

# 2. TypeScript compilation check
npx tsc --noEmit

# 3. Next.js ESLint verification
npm run lint

# 4. Production build simulation
npm run build

# 5. Live Supabase & Firebase backend validation
npm run verify:backend

# 6. Conversion smoke test (PDF, DOCX, PPTX in local or preview)
node tests/smoke-conversion.mjs
```

**Quality Gate Criteria:**
- 100% test pass rate (0 failures).
- Zero TypeScript diagnostics.
- Zero lint errors.
- Successful `next build` artifact creation.
- All backend connectivity and RLS checks pass.

---

## 2. Production Deployment & Monitoring

1. **Merge to Main:**
   - Once all automated checks pass on the GitHub pull request, merge to `main`.
   - Vercel automatically detects the commit on `main` and initiates the production deployment.

2. **Smoke Verification on Production:**
   - Navigate to `https://noctra-pdfconverter.vercel.app`.
   - Convert a sample PDF document (`BCA _3rd_sem.pdf` or `MANUAL_1.pdf`) to verify client-side conversion engine and download settlement.
   - Verify theme toggle (System, Light, Dark) and Dark Sweep animations.
   - Test sign-in / sign-out and conversion history persistence.

---

## 3. Rollback Procedures

### Scenario A: Vercel Application Rollback (Instant)
If a runtime defect or frontend regression occurs in production:
1. Open the [Vercel Dashboard](https://vercel.com).
2. Go to **Deployments**.
3. Locate the last known good deployment (marked with git hash).
4. Click the three dots menu `...` > **Instant Rollback**.
5. Vercel routes 100% of incoming production traffic to the prior deployment within seconds.

### Scenario B: Database Schema Rollback
Since all migrations in `supabase/migrations/` are additive:
- Existing columns and tables remain compatible with prior application versions.
- If a migration added a table or column that causes an issue, write a forward-rolling corrective migration (e.g. `0006_revert_*.sql`) rather than modifying past migration files.
- If emergency data restoration is required, utilize Supabase Point-in-Time Recovery (PITR) as documented in `docs/database-migrations-and-backups.md`.

---

## 4. Incident Response & Triage

1. **Conversion Freezes or Validation Stalls:**
   - Verify client browser console for React StrictMode remount issues or PDF worker errors.
   - Check `withStageTimeout` and `mountedRef` in `src/components/UploadZone.tsx`.
   - Conversions run client-side; server outages do not prevent documents from converting or downloading.

2. **Authentication Failures:**
   - Verify `classifyAuthError` output in console.
   - Ensure Google OAuth authorized redirect URIs match `https://noctra-pdfconverter.vercel.app` in Firebase Console and Supabase Auth settings.

3. **Rate Limit 429 Responses:**
   - Standard response headers `RateLimit-Limit`, `RateLimit-Remaining`, and `Retry-After` provide retry guidance.
   - Investigate IP or user token traffic in Supabase `public.api_rate_limits` table.
