import { LegalLayout, type LegalSectionItem } from "@/components/LegalLayout";

const PRIVACY_SECTIONS: LegalSectionItem[] = [
  { id: "local-first", number: "01", title: "Local-First Document Privacy" },
  { id: "data-collected", number: "02", title: "Information We Collect (And Don't)" },
  { id: "ai-processing", number: "03", title: "AI Study Assistant & Multi-Provider Engine" },
  { id: "cookies-telemetry", number: "04", title: "Cookies, Session State & Telemetry" },
  { id: "user-rights", number: "05", title: "Your Rights & Account Deletion (GDPR/CCPA)" },
  { id: "contact", number: "06", title: "Contact & Data Protection" },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalLayout
      category="Privacy &amp; Data Governance"
      title="Privacy Policy"
      subtitle="How Noctra safeguards your study materials through local-first browser computation, zero-server document storage, and strictly gated AI processing."
      lastUpdated="October 2026"
      version="Noctra 3.0 Platform"
      readTime="5 min read"
      sections={PRIVACY_SECTIONS}
      counterpartLink={{
        href: "/terms",
        label: "Terms of Service",
      }}
    >
      {/* ── Section 1: Core Commitment ───────────────────────────────── */}
      <section id="local-first" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">01</span>
          <h2 className="legal-section-title">Our Core Commitment: Local-First Document Privacy</h2>
        </div>
        <div className="legal-section-body">
          <p>
            At Noctra, your document confidentiality is our primary architectural foundation. Traditional document converter services upload your private files, presentation slides, and notes to remote servers, cloud queues, or temporary staging buckets. Noctra is engineered to eliminate that exposure entirely.
          </p>

          <div className="legal-callout-card is-emerald">
            <h3 className="legal-callout-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Zero-Server Document Processing Guarantee</span>
            </h3>
            <p className="legal-callout-text">
              During standard document conversion, your original files (<strong className="legal-strong">PDF, DOCX, PPTX</strong>) and their converted dark-mode equivalents are processed exclusively inside your browser&apos;s Web Worker and WebAssembly memory buffers. Your files are <strong className="legal-strong">never uploaded to, transmitted across, or stored on Noctra application servers</strong>.
            </p>
          </div>

          <p>
            When conversion finishes, the resulting file is assembled entirely in client memory and offered for download as a native browser blob. Once you close your browser tab or clear your session, the in-memory document data is wiped by the browser engine.
          </p>
        </div>
      </section>

      {/* ── Section 2: Data Collection ───────────────────────────────── */}
      <section id="data-collected" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">02</span>
          <h2 className="legal-section-title">What Information We Collect (And What We Don&apos;t)</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Noctra collects only the minimal operational data required to deliver account convenience and authentication features:
          </p>

          <ul className="legal-list">
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Unauthenticated Guest Usage:</strong> Zero personal data is collected. You can convert unlimited files anonymously without creating an account or providing an email address.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Authenticated Account Metadata:</strong> If you sign in via email or Google OAuth to track conversion history across devices, we store minimal metadata in Supabase: your account UID, email address, original filename, converted file size, page count, SHA-256 document checksum, and user-defined tags or favorites.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Authentication Credentials:</strong> User authentication is managed through Supabase Auth using industry-standard cryptographic token verification (JWT) and modern password hashing algorithms (bcrypt/Argon2). We never see or store plaintext passwords.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-cross">✕</span>
              <div>
                <strong className="legal-strong">Never Collected or Stored:</strong> Noctra never parses, collects, or retains your document binary files, raw presentation text, or embedded imagery on our servers.
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Section 3: AI Processing & Fallback ───────────────────────── */}
      <section id="ai-processing" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">03</span>
          <h2 className="legal-section-title">AI Study Assistant &amp; Multi-Provider Engine</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Noctra features an optional, deeply integrated AI Study Assistant capable of transforming study materials into interactive quizzes, concept explanations, flashcards, and exam preparation aids. Because this functionality requires large language model (LLM) inference, we uphold the highest standards of transparency regarding how study text is processed.
          </p>

          <div className="legal-callout-card">
            <h3 className="legal-callout-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span>Explicit Session-Level Consent Required</span>
            </h3>
            <p className="legal-callout-text">
              <strong className="legal-strong">No document text is ever transmitted automatically.</strong> Before any study aid can be generated, you must affirmatively grant consent via the Study AI interface. Your original document binary files (<strong className="legal-strong">.pdf, .docx, .pptx</strong>) are never transmitted. Only the specific extracted text excerpts needed for the requested study objective are dispatched.
            </p>
          </div>

          <h3 className="legal-strong" style={{ fontSize: "1rem", margin: "24px 0 8px" }}>
            Multi-Provider Sequential Failover Architecture
          </h3>
          <p>
            To guarantee 24/7 uptime and prevent study session interruptions during upstream rate limits or outages, Noctra routes approved study requests through a 3-tier sequential provider engine:
          </p>

          <div className="legal-tier-grid">
            <div className="legal-tier-card">
              <span className="legal-tier-num">Priority 1 · Primary</span>
              <span className="legal-tier-name">Gemini Primary</span>
              <span className="legal-tier-model">gemini-3.5-flash</span>
            </div>
            <div className="legal-tier-card">
              <span className="legal-tier-num">Priority 2 · Backup</span>
              <span className="legal-tier-name">Gemini Secondary</span>
              <span className="legal-tier-model">gemini-flash-lite-latest</span>
            </div>
            <div className="legal-tier-card">
              <span className="legal-tier-num">Priority 3 · Fallback</span>
              <span className="legal-tier-name">OpenRouter Free</span>
              <span className="legal-tier-model">nvidia/nemotron-3.5-lightning:free</span>
            </div>
          </div>

          <ul className="legal-list">
            <li className="legal-list-item">
              <span className="legal-bullet">→</span>
              <div>
                <strong className="legal-strong">Sequential Dispatch:</strong> Noctra never executes providers concurrently. Gemini Primary is queried first. If it encounters an HTTP 429 rate limit, timeout, or upstream failure, the request automatically fails over to Gemini Secondary, and subsequently to OpenRouter Free tier.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet">→</span>
              <div>
                <strong className="legal-strong">Grounded Passage Isolation:</strong> The identical approved passage excerpts are passed along the fallback chain. The engine validates structured output (e.g., parseable quiz schemas) before presenting the result to the student.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet">→</span>
              <div>
                <strong className="legal-strong">Provider Terms &amp; Realities:</strong> Requests dispatched to Gemini are governed by Google&apos;s standard Generative AI API developer terms and Google Cloud privacy policies. Requests routed to OpenRouter are governed by OpenRouter&apos;s API terms and the respective model host&apos;s terms.
              </div>
            </li>
          </ul>

          <div className="legal-callout-card is-amber">
            <h3 className="legal-callout-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>Substantiated Privacy Standards Notice</span>
            </h3>
            <p className="legal-callout-text">
              Noctra operates on standard commercial developer API tiers and makes no unsubstantiated claims regarding custom enterprise Business Associate Agreements (BAA), proprietary zero-retention waivers, or bespoke model training exemptions beyond the terms published by Google and OpenRouter for their developer APIs. Users with sensitive, privileged, or regulated materials (e.g. HIPAA, classified data, or proprietary trade secrets) should exercise discretion and avoid submitting excerpt text to cloud AI providers.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 4: Cookies & Telemetry ───────────────────────────── */}
      <section id="cookies-telemetry" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">04</span>
          <h2 className="legal-section-title">Cookies, Session State &amp; Telemetry</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Noctra takes a strict minimalist approach to browser cookies and performance telemetry:
          </p>

          <ul className="legal-list">
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Zero Third-Party Advertising Trackers:</strong> We do not embed Facebook Pixels, Google Analytics marketing trackers, advertising cookies, or fingerprinting scripts.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Strictly Necessary Cookies:</strong> We utilize secure, HTTP-only authentication cookies (<code className="legal-code">noctra_session</code>) to maintain signed-in dashboard sessions across page reloads.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Local Storage:</strong> Browser <code className="legal-code">localStorage</code> is used strictly for client preferences, including your UI theme preference (dark, light, system) and reader zoom/bookmark states.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-check">✓</span>
              <div>
                <strong className="legal-strong">Privacy-Centric Telemetry:</strong> High-level performance benchmarks (such as Web Worker conversion rendering times) are aggregated anonymously. Telemetry never contains document contents, filenames, or user identifiers, and strictly honors browser Do Not Track (<code className="legal-code">DNT</code>) flags.
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Section 5: GDPR / CCPA & Deletion ────────────────────────── */}
      <section id="user-rights" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">05</span>
          <h2 className="legal-section-title">Your Rights &amp; Immediate Account Deletion (GDPR / CCPA)</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Under the European General Data Protection Regulation (<strong className="legal-strong">GDPR</strong>) and the California Consumer Privacy Act (<strong className="legal-strong">CCPA</strong>), you hold comprehensive rights over your personal data:
          </p>

          <ul className="legal-list">
            <li className="legal-list-item">
              <span className="legal-bullet">01</span>
              <div>
                <strong className="legal-strong">Right of Access &amp; Portability:</strong> You can inspect and export your saved conversion metadata at any time from your Noctra dashboard.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet">02</span>
              <div>
                <strong className="legal-strong">Right to Rectification:</strong> You can update your account profile and tags directly through account settings.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet">03</span>
              <div>
                <strong className="legal-strong">Right to Erasure (Immediate Deletion):</strong> You have the absolute right to permanently delete your account and all associated data.
              </div>
            </li>
          </ul>

          <div className="legal-callout-card">
            <h3 className="legal-callout-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <span>Instant Self-Service Deletion via Dashboard</span>
            </h3>
            <p className="legal-callout-text">
              You can trigger a permanent, irreversible purge of your account, authentication credentials, conversion records, tags, and annotations by navigating to <strong className="legal-strong">Dashboard → Settings → Danger Zone</strong> and clicking &quot;Delete My Account &amp; Data&quot;. This immediately calls our authenticated server endpoint, deleting all database records permanently without grace periods or retention staging.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 6: Contact ───────────────────────────────────────── */}
      <section id="contact" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">06</span>
          <h2 className="legal-section-title">Contact &amp; Data Protection Officer</h2>
        </div>
        <div className="legal-section-body">
          <p>
            If you have questions regarding this Privacy Policy, your legal rights, or our technical security implementation, please reach out to our team:
          </p>

          <ul className="legal-list">
            <li className="legal-list-item">
              <span className="legal-bullet">✉</span>
              <div>
                <strong className="legal-strong">Security &amp; Privacy Contact:</strong>{" "}
                <code className="legal-code">security@noctra.dev</code>
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet">🐙</span>
              <div>
                <strong className="legal-strong">GitHub Repository &amp; Issues:</strong>{" "}
                <a
                  href="https://github.com/skandachandrashekar335-wq/Noctra-pdfconverter"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent-purple)", textDecoration: "none" }}
                >
                  github.com/skandachandrashekar335-wq/Noctra-pdfconverter
                </a>
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet">🛡</span>
              <div>
                <strong className="legal-strong">Lead Developer &amp; Data Officer:</strong> Skanda Chandrashekar
              </div>
            </li>
          </ul>
        </div>
      </section>
    </LegalLayout>
  );
}
