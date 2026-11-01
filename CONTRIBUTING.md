# Contributing to Noctra

Thank you for your interest in contributing to Noctra!

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter.git
   cd Noctra-pdfconverter
   ```

2. **Install dependencies**
   ```bash
   npm ci
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Firebase and Supabase credentials
   # PDF/PPTX conversion works without any credentials
   # AI Study requires GEMINI_API_KEY or OPENROUTER_API_KEY
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Verify the test suite**
   ```bash
   npm test              # 335 tests across 86 suites
   npx tsc --noEmit      # TypeScript type checking
   npm run lint          # ESLint
   npm run build         # Production build verification
   ```

## Branch Naming

Use descriptive, lowercase branch names with hyphens:
- `feat/pdf-batch-retry`
- `fix/quiz-parsing-edge-case`
- `docs/update-env-vars`

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Purpose |
|--------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Tests only |
| `chore` | Maintenance / tooling |
| `ci` | CI configuration |
| `perf` | Performance improvement |

Examples:
```
feat(study): add gap analysis study objective
fix(pdf): handle empty page gracefully
docs: add architecture overview
```

## Testing Expectations

- All new features must include tests
- Run `npm test` and confirm all 335 tests pass
- New tests must not break existing coverage
- Distinguish unit tests from integration/live-provider tests clearly in naming and comments
- Do not mock real API responses and report them as live verification

## Code Style

- TypeScript with strict mode — no `any` without justification
- ESLint via `eslint-config-next` — no errors, warnings are reviewed
- Tailwind CSS for styling — use existing design tokens
- Server-side secrets: **never** use `NEXT_PUBLIC_` prefix for API keys or service credentials
- Document complex functions and non-obvious decisions with inline comments

## Pull Request Requirements

- Title must follow conventional commit format
- Fill in the pull request template completely
- All quality checks must pass:
  - `npm test` — 0 failures
  - `npx tsc --noEmit` — 0 errors
  - `npm run lint` — 0 errors
  - `npm run build` — success
- No secrets, API keys, or credential values in the diff
- `.env.local` must NOT appear in staged files
- UI changes require screenshots (desktop and mobile)

## Review Process

1. Author opens PR against `main`
2. CI runs automatically (typecheck, lint, test, build)
3. Maintainer reviews
4. Author addresses feedback
5. Maintainer merges when all checks pass and review is approved

## Security Issues

**Do not open public issues for security vulnerabilities.**  
Use [GitHub Security Advisories](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/security/advisories/new) to report privately.

See [SECURITY.md](SECURITY.md) for the full security policy.

## Questions?

Open an issue with the `question` label or see [SUPPORT.md](SUPPORT.md).
