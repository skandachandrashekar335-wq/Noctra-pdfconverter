# Testing Guide

Noctra uses the **Node.js built-in test runner** (`node:test`), introduced in Node 18 and stabilised in Node 20+. No third-party test framework (Jest, Vitest, Mocha) is required.

---

## Running Tests

```bash
npm test
```

This executes:

```bash
node --import ./tests/alias-hook.mjs \
     --test \
     --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
     "tests/*.test.ts"
```

**Expected result:** 335 tests passing across 86 suites.

### What each flag does

| Flag | Purpose |
|---|---|
| `--import ./tests/alias-hook.mjs` | Registers module path aliases (e.g., `@/lib/*` → `src/lib/*`) so TypeScript path aliases work without a build step |
| `--test` | Runs all matched files as Node.js test suites |
| `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` | Suppresses a noisy ESM interop warning from some dependencies |
| `"tests/*.test.ts"` | Glob pattern — matches every `*.test.ts` file in the `tests/` directory |

### Additional quality gates

```bash
npx tsc --noEmit     # TypeScript strict-mode type check (no JS output)
npm run lint         # ESLint with eslint-config-next
npm run build        # Full Next.js production build
```

All four must pass before a pull request can merge.

---

## Test File Map

| Test file | What it covers |
|---|---|
| `pdf-converter.test.ts` | PDF dark sweep engine, page rendering, output composition |
| `pptx-converter.test.ts` | PPTX ZIP/XML colour remap, slide master overrides |
| `dark-transform.test.ts` | Pixel-level dark sweep algorithm correctness |
| `pdf-text-layer.test.ts` | Invisible text overlay positioning and encoding |
| `docx-converter.test.ts` | DOCX text extraction for AI Study |
| `ai-study.test.ts` | Study task prompt construction, response parsing |
| `ai-provider-fallback.test.ts` | 3-tier fallback logic, auth-failure short-circuit, health status tracking |
| `study-platform-2.0.test.ts` | End-to-end study platform flow |
| `auth-resolver.test.ts` | Firebase token verification logic |
| `auth-errors.test.ts` | Auth error handling and rejection cases |
| `firebase-admin.test.ts` | Firebase Admin SDK initialisation |
| `firebase-config.test.ts` | Firebase client config validation |
| `firestore-rules.test.ts` | Firestore security rules |
| `history-handlers.test.ts` | `/api/history` route handlers (CRUD) |
| `history-row.test.ts` | History row schema and validation |
| `history-tracker.test.ts` | Client-side history tracking logic |
| `supabase-schema.test.ts` | Supabase table schema validation |
| `access-control.test.ts` | Route-level access control enforcement |
| `rate-limiter.test.ts` | Per-UID rate limiting logic |
| `validation.test.ts` | Input validation utilities |
| `output-validation.test.ts` | Output PDF/PPTX validation |
| `output-resources.test.ts` | Blob URL lifecycle management |
| `conversion-lifecycle.test.ts` | Full conversion pipeline lifecycle |
| `conversion-no-block.test.ts` | Main-thread non-blocking behaviour during conversion |
| `conversion-profiles.test.ts` | Conversion profile application |
| `custom-colors.test.ts` | Custom colour profile handling |
| `temp-resources.test.ts` | Temporary resource cleanup |
| `validation-stall.test.ts` | Stall watchdog and stage-timeout regression lock |
| `error-monitoring.test.ts` | Error capture and classification |
| `ocr.test.ts` | OCR/text extraction utilities |
| `reader-handlers.test.ts` | PDF reader API handlers |
| `routing-contract.test.ts` | API route contract tests |
| `landing-cta.test.ts` | Landing page CTA content assertions |
| `run-conversion.integration.test.ts` | Integration: full conversion round-trip |

---

## Test Runner Architecture

The alias hook (`tests/alias-hook.mjs`) uses the Node.js `--import` loader API to intercept `import` statements at runtime. This allows test files to use TypeScript path aliases (`@/lib/...`) identically to how source files do, without requiring a separate compilation or bundling step.

TypeScript files are transpiled on-the-fly using Node's native TypeScript strip-types mode (Node 24 supports `--experimental-strip-types` natively, making TypeScript test files runnable without a compile step).

---

## Live Provider Tests

The standard `npm test` suite uses **mocked AI providers** — no real API calls are made, and no credentials are required. Live provider integration tests (which make actual API calls to Gemini and OpenRouter) are run separately via:

```bash
npm run verify:backend
```

This script requires real credentials in `.env.local` and is intended for staging/pre-deploy verification, not routine development.

---

## Writing New Tests

1. Create `tests/your-feature.test.ts`
2. Use the Node.js built-in `test` and `assert` modules:

```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('MyFeature', () => {
  test('does the thing correctly', () => {
    const result = myFunction('input');
    assert.equal(result, 'expected output');
  });
});
```

3. Run `npm test` to confirm the new suite passes.
4. All new features must have tests; all new tests must not break existing passing tests.

---

## Related Documentation

- [Local Setup](./LOCAL_SETUP.md)
- [Code Style](./CODE_STYLE.md)
- [Production Checklist](../deployment/PRODUCTION_CHECKLIST.md)
