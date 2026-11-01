# Code Style Guide

This document describes the conventions and standards used in the Noctra codebase.

---

## Language and Compiler Settings

- **TypeScript** with `strict: true` (see [`tsconfig.json`](../../tsconfig.json))
- All new files must be `.ts` or `.tsx` — no plain `.js` in `src/`
- Server-side module errors are caught at type-check time (`npx tsc --noEmit`)

### Key TypeScript strictness flags enabled

| Flag | Effect |
|---|---|
| `strict` | Enables all strict type checks |
| `noImplicitAny` | All variables must have explicit or inferable types |
| `strictNullChecks` | `null` and `undefined` are not assignable to other types |
| `noUncheckedIndexedAccess` | Array/object index access returns `T \| undefined` |

---

## Linting

ESLint is configured via `eslint-config-next` (see `eslint.config.mjs` or `.eslintrc`).

```bash
npm run lint         # check only
npm run lint -- --fix  # auto-fix where possible
```

Do not disable ESLint rules with `// eslint-disable` comments without a documented reason.

---

## Styling

**Tailwind CSS 4** is the only styling mechanism used:

- No inline `style={{}}` props unless absolutely necessary (e.g., dynamic CSS custom properties)
- No CSS Modules or styled-components
- Global styles in `src/app/globals.css`; design tokens as CSS custom properties
- Prefer Tailwind utility classes; use `@apply` only in `globals.css` for repeated base styles

### Theme Architecture

- Dark mode is the **default** theme
- Light mode is expressed as `:root[data-theme="light"]` (not a `dark:` media query prefix)
- System preference following is implemented in JavaScript, not via `@media (prefers-color-scheme: dark)`
- Do not hard-code hex colours in component files; use CSS custom properties from the token system

---

## File and Directory Conventions

```
src/
├── app/           — Next.js App Router pages and API routes
│   └── api/       — API routes (server-side only)
├── components/    — Shared React components
├── lib/           — Pure utility modules (no React)
│   └── server/    — Server-only utilities (never imported by browser components)
└── types/         — Shared TypeScript types and interfaces
```

- **Server-only code** goes in `src/lib/server/` or is guarded with `import 'server-only'`
- **Browser-only code** (PDF.js, canvas APIs) must not be imported in server components or API routes

---

## Naming Conventions

| Kind | Convention | Example |
|---|---|---|
| React components | PascalCase | `ConversionEngine.tsx` |
| Utility modules | kebab-case | `pdf-converter.ts` |
| Types/interfaces | PascalCase | `StudyRequest`, `ConversionResult` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_FILE_SIZE_BYTES` |
| CSS custom properties | `--kebab-case` | `--color-background-primary` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `GEMINI_API_KEY` |

---

## Commit Conventions

Noctra uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation-only changes |
| `refactor` | Code restructuring without behaviour change |
| `test` | Adding or improving tests |
| `chore` | Routine maintenance (deps update, config) |
| `perf` | Performance improvements |
| `ci` | CI/CD configuration changes |

**Examples:**
```
feat(ai): add evaluate-answer study task type
fix(pdf): resolve stall at 96% with stage-scoped timeout
docs(architecture): add AI provider fallback documentation
```

---

## Security Rules

These are enforced by code review and CI:

1. **No hardcoded secrets.** API keys, service account credentials, and database URLs must only appear in environment variables.
2. **No `NEXT_PUBLIC_` secrets.** Server-side credentials (`SUPABASE_SECRET_KEY`, `FIREBASE_ADMIN_PRIVATE_KEY`, AI API keys) must never be prefixed with `NEXT_PUBLIC_`. Violations are caught by the Supabase config guard and by code review.
3. **No `uid` from request bodies.** The user UID must always come from a verified Firebase ID token, never from a client-supplied body field.
4. **Rate limiting on all API routes.** New API routes must include rate limiting before they can be merged.

---

## Import Order

Organise imports in this order (enforced by ESLint):

1. Node built-ins (`node:path`, `node:fs`)
2. External packages (`next`, `react`, `firebase`)
3. Internal aliases (`@/lib/...`, `@/components/...`)
4. Relative imports (`./util`, `../types`)

---

## Related Documentation

- [Testing](./TESTING.md)
- [Local Setup](./LOCAL_SETUP.md)
- [Contributing](../../CONTRIBUTING.md)
