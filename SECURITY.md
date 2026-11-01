# Security Policy

## Supported Versions

The `main` branch is the only supported version. Apply security fixes from the latest commit.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report via [GitHub Security Advisories](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/security/advisories/new) — this creates a private report visible only to maintainers.

### What to include

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact (what could an attacker do?)
- Any suggested remediation

### Response timeline

| Stage | Target |
|-------|--------|
| Initial triage | 5 business days |
| Severity assessment | 10 business days |
| Patch and disclosure | Depends on complexity and severity |

## Security Model

### What is client-side (no server involvement)

- PDF and PPTX file bytes
- Pixel-level dark-mode transformation
- Output file generation

Files never leave the browser during conversion. No document content is stored server-side.

### What is server-side

- Firebase ID token verification (`/api/history`, `/api/reader`)
- Supabase write operations (conversion history metadata — not file content)
- AI Study text passages (with explicit user consent)

### Credential security

- All API keys and service credentials are server-side environment variables
- No server secret is ever prefixed `NEXT_PUBLIC_`
- `.env.local` is gitignored and must never be committed
- The AI consent gateway requires explicit user consent before any study text is sent to AI providers

## Secret Handling for Contributors

- Never commit API keys, private keys or authentication tokens
- Never add credentials to comments, documentation or screenshots
- Use `.env.local` for local secrets — it is gitignored
- If you suspect a secret was accidentally committed, report it immediately via Security Advisories

## Severity Classification

| Severity | Examples |
|----------|---------|
| Critical | Remote code execution, full account compromise |
| High | Authentication bypass, privilege escalation, credential exposure |
| Medium | Sensitive information disclosure, CSRF |
| Low | Minor information leakage, denial of service (limited scope) |

## Remediation Process

1. Maintainer receives and triages the private report
2. A fix branch is prepared privately
3. The fix is reviewed and tested
4. A coordinated disclosure is agreed with the reporter
5. Fix is merged, version bumped, and a security advisory published
