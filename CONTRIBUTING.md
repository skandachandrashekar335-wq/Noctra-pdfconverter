# Contributing to Noctra

## Development Setup

1. Clone the repository
2. Install dependencies: `npm ci`
3. Copy `.env.example` to `.env.local`
4. Run `npm run dev`
5. Run `npm test` to verify the suite (263 tests)
6. Run `npx tsc --noEmit` for type checking
7. Run `npm run lint` for ESLint

## Branch Naming

Use descriptive, lowercase branch names with hyphens. Example: `feat/pdf-conversion-refactor`.

## Commit Conventions

Conventional Commits are used:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `refactor`: Code restructuring without behavior change
- `test`: Adding missing or improving existing tests
- `chore`: Routine maintenance

## Testing Expectations

- All new features must include appropriate tests
- Run `npm test` to verify the full suite passes
- New tests should not break existing coverage

## Pull Request Requirements

- Title must follow conventional commit format
- Description should summarize the change
- All tests must pass
- TypeScript must have no errors
- Lint must have no errors
- Production build must succeed

## Review Process

1. Author opens the pull request against `main`
2. Maintainers review the change
3. Authors address any reviewer feedback
4. Once all checks pass, a maintainer merges the PR
PR