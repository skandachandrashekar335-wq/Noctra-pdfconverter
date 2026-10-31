# Changelog

All notable changes to Noctra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Secure by-default conversion pipeline with output validation
- Multi-provider AI fallback engine (Gemini → Gemini → OpenRouter)
- Enhanced Dark Sweep clickable thumbnail previews
- Compact segmented theme-toggle control (replacing pill shape)
- Accessible page preview modal with navigation

### Changed
- Theme architecture: dark default, light as `:root[data-theme="light"]`
- Conversion output validation with pdf-lib verification
- Stall watchdog with stage-scoped timeouts
- AI provider health tracking and status reporting
- Theme persistence and OS preference following

### Fixed
- PDF conversion stall at 96% — validation timeout and watchdog
- Theme hydration mismatch on server/client first render
- Misleading conversion copy (DOCX/PPTX disclaimer removal)
- Output URL lifecycle — grace period for in-flight downloads

### Security
- `.env.local` never committed (gitignored)
- Firebase admin key rotation guidance
- Supabase RLS enforcement
- Security policies documented
CHANGELOG