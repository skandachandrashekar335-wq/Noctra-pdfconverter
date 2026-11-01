# Noctra

**Privacy-focused document conversion and AI-assisted study platform.**

Noctra converts PDF and PowerPoint documents into dark-mode formats using browser-based processing. It also provides AI-powered study tools that help users summarize material, understand key concepts, generate practice questions, and prepare for examinations.

- **Live application:** https://noctra-pdfconverter.vercel.app
- **Source code:** https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter
- **License:** Apache License 2.0

[![CI](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/actions/workflows/ci.yml/badge.svg)](https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)

---

## Overview

Noctra addresses two related needs: making digital study materials more comfortable to read and helping users work with the information in those materials.

The conversion workflow runs locally in the browser. Original PDF and PPTX files are processed on the user's device and are not uploaded as part of conversion. AI study features are separate: when a user explicitly provides consent, selected extracted text can be sent to the configured AI provider for processing.

The application is designed for students, educators, and users who regularly work with digital documents.

## Core capabilities

### Document conversion

| Capability | Description |
| --- | --- |
| PDF dark-mode conversion | Converts PDF pages into a dark reading format. |
| PowerPoint conversion | Applies dark-mode transformations to PPTX presentations. |
| Batch processing | Processes multiple supported files in one workflow. |
| Conversion profiles | Provides configurable conversion profiles and background colours. |
| Searchable PDF output | Adds an invisible text layer to support text search in converted PDFs. |
| Link preservation | Preserves supported PDF link annotations. |
| Local processing | Processes original PDF and PPTX files in the browser without uploading them for conversion. |

### AI study tools

AI study functionality requires valid provider configuration. Available tasks include:

- Executive summaries and key-point extraction
- Explanations of selected concepts
- Multiple-choice quizzes with explanations
- Structured practice exams
- Flashcard generation
- Revision planning
- Weak-topic identification and gap analysis
- Conversational study assistance
- Exam questions with model answers
- Answer evaluation and feedback

AI processing is consent-gated. Selected extracted text is sent to the configured provider only after the user gives explicit consent.

### Application features

- Firebase authentication with email and Google sign-in
- Protected application dashboard
- Dark, light, and system appearance settings
- Sequential AI provider fallback
- Bring Your Own Key (BYOK) support in the application
- Conversion history for authenticated users, subject to backend configuration
- Responsive layouts for desktop and mobile browsers
- Privacy, terms, and account-management pages

## Application architecture

Noctra uses a browser-first processing model for document conversion and a server-side integration layer for authenticated services and AI requests.

~~~text
Browser
  |
  +-- PDF.js
  |     Renders PDF pages for conversion
  |
  +-- Canvas processing
  |     Applies dark-mode transformations
  |
  +-- pdf-lib
  |     Composes converted PDF output and text layers
  |
  +-- JSZip
        Reads and updates PPTX package content

Next.js server
  |
  +-- /api/study
  |     Validates requests and consent
  |     Routes requests through the AI provider fallback engine
  |
  +-- /api/history
  |     Verifies Firebase ID tokens
  |     Reads and writes conversion metadata through Supabase
  |
  +-- /api/auth and account routes
        Handle server-side authentication and account operations
~~~

### Privacy and data handling

| Data | Processing or storage |
| --- | --- |
| Original PDF and PPTX files during conversion | Browser memory; not uploaded as part of conversion |
| Rendered pages and conversion output | Processed locally in the browser |
| Extracted study text | Sent to an AI provider only after explicit user consent |
| Authentication | Firebase Authentication, with server-side token verification |
| Conversion history | Supabase PostgreSQL through authenticated server routes |
| AI provider credentials | Configured for server-side use; server secrets must not be exposed through public environment variables |

For the detailed data-flow and security model, see [Privacy Architecture](docs/security/PRIVACY_ARCHITECTURE.md), [Security Model](docs/security/SECURITY_MODEL.md), and [Threat Model](docs/security/THREAT_MODEL.md).

## Technology stack

| Area | Technologies |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4 |
| PDF processing | PDF.js, pdf-lib |
| PowerPoint processing | JSZip and XML package manipulation |
| Authentication | Firebase Authentication, Firebase Admin SDK |
| Database and history | Supabase PostgreSQL |
| AI providers | Google Gemini, OpenRouter |
| Hosting | Vercel |
| Testing | Node.js built-in test runner |
| CI | GitHub Actions |

## Getting started

### Prerequisites

- Node.js 24.x
- npm
- A modern browser

### Installation

~~~bash
git clone https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter.git
cd Noctra-pdfconverter
npm ci
cp .env.example .env.local
~~~

Configure the environment variables required for the services you intend to use, then start the development server:

~~~bash
npm run dev
~~~

Open http://localhost:3000.

**Local conversion does not require service credentials.** PDF and PPTX conversion run in the browser. Authentication, saved history, and AI study features require their respective configuration.

For a detailed setup guide, see [Local Setup](docs/development/LOCAL_SETUP.md) and [Environment Variables](docs/development/ENVIRONMENT_VARIABLES.md).

## Environment configuration

Noctra uses environment variables for Firebase, Supabase, and AI provider configuration. The repository includes the [environment template](.env.example) as a reference.

| Configuration | Used for |
| --- | --- |
| NEXT_PUBLIC_FIREBASE_* | Firebase client configuration |
| FIREBASE_ADMIN_PROJECT_ID | Server-side Firebase token verification |
| FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY | Firebase Admin operations where required |
| SUPABASE_URL | Supabase project connection |
| SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY | Server-side history access |
| GEMINI_API_KEY | Primary AI provider |
| GEMINI_SECONDARY_API_KEY | Optional secondary Gemini provider |
| OPENROUTER_API_KEY | AI fallback provider |

See the complete [Environment Variables Guide](docs/development/ENVIRONMENT_VARIABLES.md) before configuring a deployment.

**Security requirement:** Never commit .env.local or expose server-side credentials through variables prefixed with NEXT_PUBLIC_.

## Development commands

| Command | Purpose |
| --- | --- |
| npm run dev | Start the local development server |
| npm run build | Create a production build |
| npm run start | Run the production build locally |
| npm run lint | Run ESLint |
| npx tsc --noEmit | Run the TypeScript type check |
| npm test | Run the automated test suite |
| npm run test:e2e | Run the browser-based PDF smoke test; requires a local server |
| npm run verify:backend | Verify configured backend services; requires the relevant credentials |

## AI provider fallback

AI study requests use a sequential provider strategy:

1. Primary Google Gemini configuration
2. Secondary Gemini configuration, when configured
3. OpenRouter fallback, when configured

The application handles provider failures and returns a structured error if no configured provider can complete the request. Provider credentials must remain server-side. Availability and rate limits depend on the configured providers and their current service terms.

## Testing and continuous integration

The automated test suite uses the Node.js built-in test runner. The documented suite covers PDF and PPTX conversion, document transformation, AI task construction, provider fallback, authentication, access control, API validation, rate limiting, history handlers, and resource lifecycle behavior.

Run the local quality checks with:

~~~bash
npx tsc --noEmit
npm run lint
npm test
npm run build
~~~

GitHub Actions runs the type check, lint, test suite, production build, and a dependency-audit reporting step for pushes to main, pull requests targeting main, and manual workflow dispatches.

See the [Testing Guide](docs/development/TESTING.md) for test coverage and execution details.

## Deployment

The production application is hosted on Vercel:

https://noctra-pdfconverter.vercel.app

The repository is connected to Vercel for deployment from the primary branch. Production functionality depends on the required environment variables being configured in the Vercel project settings.

- [Vercel Deployment Guide](docs/deployment/VERCEL_DEPLOYMENT.md)
- [Production Checklist](docs/deployment/PRODUCTION_CHECKLIST.md)
- [Release Process](docs/deployment/RELEASE_PROCESS.md)

## Current limitations

- PDF conversion currently produces rasterized page output with an invisible text layer for searchability; vector content is not preserved as editable PDF vectors.
- Complex PowerPoint gradient definitions may not transform perfectly.
- AI study functionality depends on valid provider credentials, provider availability, rate limits, and network access.
- Saved conversion history depends on the Supabase configuration and required database migrations being applied.
- Direct DOCX and EPUB conversion pipelines are planned roadmap items; DOCX text extraction is used for supported AI study workflows.

## Roadmap

Planned product improvements include:

- Document organization with folders and tags
- Expanded document-format support
- Selective vector-preserving PDF conversion
- Batch archive export
- Spaced-repetition scheduling
- Voice-based study assistance
- Mathematical formula extraction
- Collaborative study workspaces
- Offline application support

See the [Product Roadmap](docs/product/ROADMAP.md) for current planning details.

## Documentation

| Resource | Description |
| --- | --- |
| [Local Setup](docs/development/LOCAL_SETUP.md) | Development environment setup |
| [Environment Variables](docs/development/ENVIRONMENT_VARIABLES.md) | Configuration reference |
| [Testing Guide](docs/development/TESTING.md) | Test execution and coverage |
| [Privacy Architecture](docs/security/PRIVACY_ARCHITECTURE.md) | Data processing and privacy controls |
| [Security Model](docs/security/SECURITY_MODEL.md) | Application security design |
| [Threat Model](docs/security/THREAT_MODEL.md) | Security risks and mitigations |
| [Deployment Guide](docs/deployment/VERCEL_DEPLOYMENT.md) | Vercel deployment instructions |
| [Production Checklist](docs/deployment/PRODUCTION_CHECKLIST.md) | Pre-release verification |
| [Product Roadmap](docs/product/ROADMAP.md) | Planned product improvements |

## Contributing

Contributions, bug reports, and technical feedback are welcome. Please review [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a pull request.

Before opening a pull request, run the relevant checks:

~~~bash
npx tsc --noEmit
npm run lint
npm test
npm run build
~~~

Please do not include credentials, private documents, or other sensitive information in issues or pull requests.

## Security

To report a security vulnerability, follow the instructions in [SECURITY.md](SECURITY.md). Please do not disclose vulnerabilities through public issues.

For general support, see [SUPPORT.md](SUPPORT.md).

## License

Noctra is distributed under the [Apache License 2.0](LICENSE).
