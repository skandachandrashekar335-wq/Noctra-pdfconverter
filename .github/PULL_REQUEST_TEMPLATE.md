## Description

<!--
Describe the change you are making and why. Link any related issues.
Example: Fixes #42. Adds support for DOCX batch conversion.
-->



## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactor (no functional change)
- [ ] Test improvement
- [ ] CI / DevOps

## How has this been tested?

<!--
Describe what testing you have done. Check every box that applies.
-->

- [ ] Unit tests added or updated (`npm test`)
- [ ] Verified manually in the browser
- [ ] Tested on mobile screen size
- [ ] Tested dark and light themes
- [ ] Tested edge cases (empty files, large files, network failures)

## Quality checklist

All boxes must be checked before requesting review:

- [ ] `npm test` passes (335 tests)
- [ ] `npx tsc --noEmit` passes (zero TypeScript errors)
- [ ] `npm run lint` passes (zero ESLint errors)
- [ ] `npm run build` succeeds
- [ ] No secrets, API keys or credentials are included
- [ ] `.env.local` is NOT staged
- [ ] Documentation updated if relevant

## Screenshots (UI changes only)

<!--
Attach before/after screenshots for any visual changes.
Desktop and mobile if applicable.
-->

## Additional notes

<!--
Any other context, trade-offs or implementation notes for reviewers.
-->
