# Security Policy

## Supported Versions

Use the latest released version from the `main` branch for security updates.

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities. Report via GitHub Security Advisories.

## Expected Response Process

- Initial triage: 5 business days
- Severity assessment: 10 business days
- Patch development: Depends on complexity

## Secret Handling

Never commit API keys, private keys, or authentication tokens. `.env.local` is gitignored.

## Security Issue Classification

| Severity | Description |
|----------|-------------|
| Critical | Remote code execution, full account compromise |
| High | Auth bypass, privilege escalation |
| Medium | Information disclosure |
| Low | Minor polishing |

## Remediation

Maintainers will prepare a fix, bump the version, and publish the update.
