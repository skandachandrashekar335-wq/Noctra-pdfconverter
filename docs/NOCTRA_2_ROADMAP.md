# NOCTRA 2.0 — Implementation Roadmap

**Status:** planning only (Phase 1 delivered a safe Git checkpoint; no feature work has begun).
**Baseline:** commit `e963079` — "fix: resolve ERR_REQUIRE_ESM breaking API routes on Vercel".
**Gate state at baseline:** 262/262 unit tests (69 suites), `tsc --noEmit` clean, `eslint .` clean,
`npm run build` succeeds, real-browser smoke test passes for PDF / DOCX / PPTX conversions.

This document is the implementation-ready plan for the NOCTRA 2.0 upgrade. Every feature below
specifies its user value, current status, dependencies, acceptance criteria, and tests. No feature
has been implemented yet; nothing here is mock work or aspirational UI.

**Constraints that apply to the whole roadmap:**

- Preserve the Noctra identity: dark-mode PDF/DOCX/PPTX → PDF conversion, privacy-first
  client-side processing, existing Firebase auth + Supabase history.
- Never replace a real feature with mock data or a fake success state. A feature ships only when
  its acceptance tests pass against real data.
- Migrations 0003/0004 exist in the repo but are **not applied** to the live Supabase project —
  applying them requires explicit authorization and is a dependency for areas 2, 4, and 6.
- The Supabase anon key rotation (previously exposed) remains a user-owned security task.

---

## 1. Premium visual redesign

**Goal:** make Noctra look and feel like a premium product without losing the dark-mode identity.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 1.1 | Unified design-token system (color, spacing, radius, elevation) | Consistent premium look across every page; future UI work becomes cheap | Partial — dark theme exists but colors/spacing are scattered across components (CSS vars in `globals.css`, ad-hoc Tailwind classes) | None | All existing pages render using tokens only; no hard-coded hex colors outside the token file; visual regression: landing, dashboard, reader unchanged in layout, improved in consistency | Add a lint rule / test that fails on hard-coded color literals in `src/app` and `src/components`; screenshot comparison of key pages |
| 1.2 | Refined landing page (hero, feature grid, conversion demo) | Higher conversion of visitors into users; clearer value proposition in < 5 s | Basic landing exists at `/` with CTA to `/dashboard`; "Three formats" copy already corrected | 1.1 | Landing communicates: three input formats, privacy (client-side), speed; Lighthouse performance ≥ 90; all CTAs reachable by keyboard | Component tests for CTA links; Lighthouse CI check; content assertion test (no "Two formats" regression) |
| 1.3 | Dashboard information architecture (grouped history, empty states, status chips) | Users can find past conversions and understand state at a glance | Dashboard lists history flat; organization columns (tags/folders) exist in schema work but UI is minimal | Migration 0003/0004 applied; 1.1 | History grouped by date; per-item status chip (queued/processing/completed/failed); empty state explains how to start; keyboard navigable | Component tests for grouping/chips; integration test against a seeded history store |
| 1.4 | Motion and feedback polish (progress transitions, toast system, skeletons) | Perceived quality; users trust the app because every state change is visible | Progress UI works (phases + finalizing labels); no unified toast/skeleton system | 1.1 | All async operations show skeleton or progress; errors surface as dismissible toasts; motion respects `prefers-reduced-motion` | Tests that toasts appear/dismiss; reduced-motion test asserting transitions are disabled |

## 2. Document library and workspace

**Goal:** turn one-off conversions into a workspace where documents persist, organize, and re-convert.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 2.1 | Document library (list, search, filter by format/status) | Users revisit past work instead of re-uploading | History store has list + limit + DELETE; no search/filter UI | Migration 0003/0004 applied; 1.3 | Search by filename; filter by input format and status; pagination stable; results scoped to the authenticated UID only | Integration tests for query + UID scoping; RLS verification via `npm run verify:backend` |
| 2.2 | Folders / tags for organization | Users manage dozens of conversions without losing track | Schema columns exist in untracked migration work; no API/UI | 2.1; migrations applied | Create/rename/delete folder; assign/remove tags; move documents; destructive actions require confirm | Handler tests for folder CRUD; integration test for tag assignment |
| 2.3 | Rename and metadata editing | Correct mislabeled files without reconverting | PATCH supports metadata columns (title, tags) in handlers; UI absent | 2.1 | Inline rename persists to Supabase and survives reload; empty/whitespace names rejected | Handler tests for PATCH validation; UI test for rename flow |
| 2.4 | Per-user retention controls (delete single, delete all, optional auto-expiry) | Privacy-conscious users can purge their data | DELETE single-document exists; no bulk delete or expiry | 2.1 | Delete-all requires typing confirmation; optional 30/90-day expiry honored server-side; deletes remove rows (verified against live store in staging) | Handler tests for bulk delete; integration test for expiry window |

## 3. Conversion engine reliability and quality

**Goal:** every supported format converts correctly, fast, and with honest quality reporting.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 3.1 | Validation lifecycle hardening (regression lock) | The "stuck at 96%" class of bug cannot return | **Done** — `yieldToEventLoop()` before validation + `withStageTimeout()` (30 s) with stage-named errors; verified by browser measurement and unit tests | None (already merged in working tree) | Any future change touching `runConversion` keeps the stall regression suite green; timeout errors name the failing stage | `tests/validation-stall.test.ts` (exists); keep in CI |
| 3.2 | Per-format quality scoring (page count, text coverage, image fidelity) | Users know the output is good before downloading | Partial — quality stats exist in `pdf-converter.ts` diff; not surfaced end-to-end | 3.1 | Completed conversions report page count and a quality score in history; score below threshold shows a warning, never silently succeeds | Unit tests for each format's scorer; integration test asserting stats land in history |
| 3.3 | Large-document performance (streaming/chunked processing for 50+ MB inputs) | Reliability on real-world heavy files (existing heavy fixture is 1.9 MB) | Not started — current engine loads and renders in memory | 3.1, 3.2 | 50 MB / 300-page PDF converts without main-thread stall > 100 ms; memory stays bounded; timeout scales with document size | New large-fixture benchmark test; browser trace asserting maxGap < 100 ms |
| 3.4 | Error taxonomy and recovery (corrupt file, password-protected, unsupported feature) | Users get actionable messages instead of generic failures | Partial — stage-named timeout errors exist; most failures still generic | 3.1 | Every failure path maps to a typed error with a human message and a suggested next step; no raw exception text reaches the UI | Unit test enumerating error taxonomy; UI test asserting friendly copy per error class |
| 3.5 | DOCX/PPTX fidelity improvements (tables, headers, embedded images) | Office documents convert looking like the original | Converters exist and produce valid OOXML/PDF (verified by magic bytes); fidelity unmeasured | 3.2 | Fidelity suite compares input/output structure (page count, text presence, image count) on the fixture corpus; no regression below baseline | New fidelity test suite across `qa-fixtures/`; baseline snapshot committed |

## 4. Advanced PDF reader and annotation

**Goal:** read and mark up converted PDFs inside Noctra instead of downloading them first.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 4.1 | In-app PDF reader (zoom, page nav, text search) | Instant review without leaving Noctra | Started — `PDFReader.tsx` and `/api/reader` exist as untracked work-in-progress; quality unknown | 2.1; migrations applied | Reader opens any completed PDF from history; zoom/page-nav keyboard accessible; search highlights matches; render does not block main thread > 50 ms | Component tests for navigation/search; browser test measuring main-thread gaps |
| 4.2 | Annotations (highlight, note, draw) that persist | Study/review workflows need markups saved per document | Not started (types groundwork in `src/types`) | 4.1; annotation table migration | Create/edit/delete annotations; annotations survive reload and re-open; scoped to owner UID | Handler tests for annotation CRUD; integration test for persistence + scoping |
| 4.3 | Annotation export (summary list / flattened copy) | Users extract notes for essays/revisions | Not started | 4.2 | Export annotations as markdown (notes + highlights with page refs); flattened-PDF export keeps original intact | Unit tests for markdown serialization; integration test for flattened output validity |
| 4.4 | Side-by-side compare (original vs converted page) | Users verify conversion quality visually | Not started | 4.1, 3.2 | Toggle or split view shows input preview vs converted page; works for PDF inputs | Browser test capturing both panes render non-empty |

## 5. AI-powered study workspace

**Goal:** optional, honest AI assistance over converted documents — never fake answers.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 5.1 | AI infrastructure boundary (server-side only, key never in client, cost controls) | Safe foundation — no key leak, no runaway spend | Started — `src/lib/ai-study.ts` untracked stub; must verify no `NEXT_PUBLIC_` AI key (enforced by existing `supabase-config.ts`-style guard) | None | AI calls only from server routes; server rejects requests without a verified Firebase token; per-user rate limit; zero AI keys with `NEXT_PUBLIC_` prefix | Unit test asserting guard rejects public-prefixed AI keys; route tests for auth + rate limit |
| 5.2 | Document-grounded Q&A (answers with page citations) | Users check understanding without rereading | Not started | 5.1, 4.1 (text layer), 3.2 | Answer includes citations to actual pages; refusal when the document doesn't contain the answer (no hallucinated success state); latency and token usage logged | Integration tests with a seeded fixture: answerable + unanswerable questions; citation-exists assertion |
| 5.3 | Auto-generated study guide (summary, key terms, flashcards) | Fast revision of any converted document | Not started | 5.1, 5.2 | Study guide generated per document; flashcards are question/answer pairs extractable from the text; user can edit before saving | Unit tests for flashcard parsing; integration test asserting guide persists to history |
| 5.4 | Quiz generation with self-check | Active recall practice | Not started | 5.3 | Quiz items cite source pages; answers validated against document text; scoring shown honestly (never 100% by default) | Unit tests for scoring; integration test for generation + grading round-trip |

## 6. Batch workflows and productivity

**Goal:** convert and manage many documents at once with clear per-document state.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 6.1 | Reliable batch conversion (queue, per-doc progress, partial failure isolation) | Users convert a semester of documents in one drop | Partial — `BatchUploadZone.tsx` and per-doc themes exist; queue semantics unverified | 3.1, 3.4 | One failing document does not stop the batch; per-document progress and status; batch completes or reports per-item results; no hidden failures | Integration test with mixed valid/corrupt fixtures asserting per-item outcomes |
| 6.2 | Batch options (shared profile, naming pattern, output folder) | Consistent outputs without clicking each file | Conversion profiles exist in engine diff; not exposed for batch | 2.2, 6.1 | Applying a profile to a batch changes every output per profile; naming pattern applied deterministically | Unit tests for naming patterns; integration test applying a profile across a batch |
| 6.3 | Resume / retry failed items | No restarting the whole batch for one bad file | Retry path exists for single conversions (tracker adopts existing record) | 6.1 | Retry re-runs only failed items; retries update the same history rows (no duplicates) | Integration test: batch → fail some → retry → assert row counts |
| 6.4 | Export batch as archive / send to library | Organized delivery of results | Not started | 2.1, 6.1 | Completed batch downloadable as a single archive with per-document files; or saved directly into library folders | Integration test asserting archive contents match completed items |

## 7. Accessibility, performance, security and release readiness

**Goal:** ship NOCTRA 2.0 as a product that is accessible, fast, secure, and releasable.

| # | Feature | User value | Current status | Dependencies | Acceptance criteria | Tests |
|---|---------|-----------|----------------|--------------|---------------------|-------|
| 7.1 | Accessibility audit + fixes (WCAG 2.1 AA: contrast, focus, labels, keyboard) | Usable by everyone, including keyboard/screen-reader users | Not audited; some keyboard support in reader work | 1.1 | Automated axe scan passes with zero serious/critical issues on landing, dashboard, reader; all flows keyboard-completable | axe integration tests per page; keyboard-navigation E2E test |
| 7.2 | Performance budgets (bundle size, LCP, main-thread responsiveness) in CI | Perf regressions caught before users feel them | Informal measurements only (browser traces during investigation) | 1.1, 3.3 | CI fails on bundle-size growth > 10% or LCP > 2.5 s on the reference device profile; conversion main-thread maxGap < 100 ms enforced | CI perf-check script; browser trace test |
| 7.3 | Security hardening: credential rotation follow-through + dependency audit | No exposed credentials; no known-vulnerable deps at release | Blocked on user-owned actions: **Supabase anon key rotation** (pending, user to perform); Firebase Admin service-account key revocation **must be verified, not assumed**; `npm audit` not yet run at baseline | User authorization for rotation | Both keys rotated/revoked with actual verification evidence; `npm audit --production` reports zero high/critical; no env/key files tracked by git (checked) | Automated test scanning tracked files for secret patterns (extends existing audit) |
| 7.4 | Rate limiting and abuse controls on API routes | Service stays up under misuse | Not present | 7.3 | Authenticated routes enforce per-UID limits; unauthenticated requests rejected before work; limits covered by tests | Route tests for limit enforcement |
| 7.5 | Release pipeline (staged rollout, rollback, health check) | Safe, reversible releases | Deploys via Vercel dashboard; no staged/rollback process | 7.3, migrations applied | Release checklist automated: gates (test/tsc/lint/build) must pass; rollback restores previous deployment within minutes; health-check endpoint verifies DB + auth | Release-check script; smoke test post-deploy |
| 7.6 | Migration application runbook (0003/0004 → live) | Schema features (library, annotations, batch) become usable | Migrations authored, **not applied — awaiting authorization** | User authorization | Runbook executed against staging first; verified by `npm run verify:backend`; rollback script tested | `verify:backend` output as evidence; schema tests |

---

## Sequencing (suggested order of attack)

1. **Foundation:** 7.3 (security follow-through), 7.6 (migrations with authorization), 1.1 (design tokens).
2. **Core quality:** 3.1 (regression lock, done), 3.2 → 3.4 → 3.5, then 3.3 (large documents).
3. **Workspace:** 2.1 → 2.2 → 2.3 → 2.4 (needs migrations), 1.3.
4. **Reader:** 4.1 → 4.2 → 4.3 (needs migrations), 1.2/1.4 alongside.
5. **AI:** 5.1 (boundary first) → 5.2 → 5.3 → 5.4 (each gated on honest-source tests).
6. **Batch:** 6.1 → 6.2 → 6.3 → 6.4.
7. **Release:** 7.1, 7.2, 7.4, 7.5 continuous; final gate before any production deploy.

## Open blockers requiring user action

- **Supabase anon key rotation** (previously exposed) — user-owned, pending.
- **Firebase Admin service-account key revocation** — must be verified with actual evidence before 7.3 can close.
- **Apply migrations 0003/0004** — requires explicit authorization (blocks areas 2, 4, 6).
- **Production deploy authorization** — nothing deploys without explicit approval.
