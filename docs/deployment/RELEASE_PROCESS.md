# Release Process

This document defines the step-by-step procedure for preparing, validating, and publishing releases of Noctra.

---

## 1. Release Philosophy

- **Zero-Downtime Releases**: Production deployments must be non-disruptive.
- **Strict Quality Gating**: No release proceeds without clean test suites, static typing, and linting.
- **Transparent Changelog**: Every customer-facing change, fix, and security update must be documented.
- **Reversibility**: Every release must have a documented rollback path to the prior verified deployment.

---

## 2. Pre-Release Quality Gates

Execute all local verification gates from a clean repository state:

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Linting
npm run lint

# 3. Complete Test Suite (335+ unit & integration tests)
npm test

# 4. Production Build Verification
npm run build
```

All 4 checks must exit with code `0`.

---

## 3. Pre-Release Hygiene Checks

1. **Working Tree**: Run `git status` to ensure no temporary files or scratch scripts are staged.
2. **Credential Safety**:
   - Verify `.env.local` is ignored and absent from git tracking.
   - Run a secret pattern check across staged changes.
3. **Changelog Update**: Move items from `[Unreleased]` to a versioned release section (`[X.Y.Z] - YYYY-MM-DD`).

---

## 4. Release Execution

1. **Commit and Tag**:
   ```bash
   git add .
   git commit -m "chore(release): vX.Y.Z"
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```

2. **Push to Remote**:
   ```bash
   git push origin main --tags
   ```

3. **Vercel Deployment**:
   - Vercel automatically deploys commits to `main`.
   - For manual production deployments or verification:
     ```bash
     npx vercel --prod --yes
     ```

4. **Post-Deployment Smoke Test**:
   - Verify `GET /` returns HTTP 200.
   - Verify `GET /dashboard` loads properly.
   - Verify `GET /api/study` reports provider readiness.
   - Verify `POST /api/study` with a valid test payload executes with expected fallback behavior.
   - Verify `GET /privacy` and `GET /terms` render correctly.

---

## 5. Rollback Procedure

If a critical regression is detected in production:

1. Identify the last healthy deployment ID in Vercel:
   ```bash
   npx vercel ls
   ```
2. Promote the previous healthy deployment:
   ```bash
   npx vercel rollback <deployment-id>
   ```
3. Alternatively, revert the commit on git `main` and push:
   ```bash
   git revert <commit-sha>
   git push origin main
   ```
