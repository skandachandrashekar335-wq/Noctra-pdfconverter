import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#08090a] text-zinc-100 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wider mb-6"
          >
            &larr; Back to Noctra
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">
            Privacy Policy
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            Last Updated: October 2026 • Noctra 3.0 Platform
          </p>
        </div>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section className="bg-[#0f1115] border border-zinc-800/80 rounded-2xl p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-3">
              1. Our Core Commitment: Local-First Document Privacy
            </h2>
            <p>
              At Noctra, your document confidentiality is our highest architectural priority.
              Unlike traditional cloud conversion tools that upload your files to remote servers,
              <strong>
                {" "}Noctra executes all document transformations (PDF, DOCX, PPTX) directly inside your web browser
              </strong>
              {" "}using client-side WebAssembly, PDF.js, and browser memory buffers.
            </p>
            <p className="mt-3 text-purple-300 font-medium">
              Your source files and converted output documents are never uploaded to, transmitted across,
              or stored on our application servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              2. What Information We Collect (And What We Don&apos;t)
            </h2>
            <p>
              Depending on how you use Noctra, we collect only the minimal data required to provide the service:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li>
                <strong className="text-zinc-200">Unauthenticated Use:</strong> Zero personal data is collected. No account is required to convert documents.
              </li>
              <li>
                <strong className="text-zinc-200">Authenticated History:</strong> When you sign in (via Google OAuth or email), we store metadata about your conversions: original file name, converted file size, page count, SHA-256 document key, and optional user tags/favorites.
              </li>
              <li>
                <strong className="text-zinc-200">Account Credentials:</strong> If you sign up with email and password, authentication is managed securely via hosted Supabase Auth with industry-standard bcrypt/Argon2 hashing.
              </li>
              <li>
                <strong className="text-zinc-200">Never Collected:</strong> We never inspect, parse, or store the contents of your files on our servers.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              3. AI Study Assistant &amp; Explicit Consent
            </h2>
            <p>
              Noctra includes an optional AI Study Assistant capable of generating summaries, study guides, and flashcards from document passages.
            </p>
            <p>
              To protect your privacy:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li>
                No text is ever transmitted to an AI provider automatically.
              </li>
              <li>
                AI processing requires an <strong>explicit user confirmation modal</strong> on each study session.
              </li>
              <li>
                Only the specific extracted text passages you approve are sent to Google Gemini under enterprise API terms that prohibit model training on customer inputs.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              4. Cookies and Telemetry
            </h2>
            <p>
              We do not employ third-party tracking pixels, advertising cookies, or behavioral surveillance scripts.
              Authentication sessions use secure HTTP-only cookies (`noctra_session`).
              Anonymous product telemetry (e.g. conversion speed benchmarks) is entirely privacy-conscious, never contains personal data or document content, and respects browser Do Not Track (DNT) flags.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              5. Your Rights &amp; Immediate Account Deletion (GDPR / CCPA)
            </h2>
            <p>
              You maintain total sovereignty over your data. Under the GDPR and CCPA, you have the right to access, rectify, export, and delete your data at any time.
            </p>
            <p>
              You can trigger a complete, irreversible deletion of your account and all associated conversion metadata directly from your Dashboard settings or via our authenticated delete endpoint. Upon deletion, all database records and authentication credentials are wiped permanently.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              6. Contact &amp; Data Protection Officer
            </h2>
            <p>
              If you have any questions or security inquiries regarding this privacy policy, please contact our team via the GitHub repository or at <code className="text-purple-300">security@noctra.dev</code>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
