import Link from "next/link";

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">
            Last Updated: October 2026 • Noctra 3.0 Platform
          </p>
        </div>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-sm text-zinc-300 leading-relaxed">
          <section className="bg-[#0f1115] border border-zinc-800/80 rounded-2xl p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-3">
              1. Acceptance of Terms
            </h2>
            <p>
              By accessing or using Noctra (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
              If you do not agree to these terms, you may not use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              2. Intellectual Property &amp; Document Ownership
            </h2>
            <p>
              <strong>You retain 100% intellectual property ownership and copyright of all documents</strong> you process through Noctra.
              Because processing runs client-side inside your browser, Noctra does not obtain any license, ownership, or right to your document contents, files, or derived outputs.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              3. Permitted &amp; Acceptable Use
            </h2>
            <p>
              You agree not to use the Service to:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-400">
              <li>Violate any applicable national or international laws or regulations.</li>
              <li>Attempt to reverse-engineer, exploit, or bypass server-side rate limits and security policies.</li>
              <li>Launch automated denial-of-service attacks or flood API endpoints.</li>
              <li>Upload malicious code designed to exploit browser rendering engines.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              4. Disclaimer of Warranties
            </h2>
            <p>
              Noctra is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether express or implied.
              While our conversion algorithms undergo rigorous regression testing, we do not warrant that output visual inversion or layout reproduction will be 100% error-free for every arbitrary file format or malformed document.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              5. Limitation of Liability
            </h2>
            <p>
              In no event shall Noctra, its developers, or affiliates be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your use or inability to use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              6. Modifications to Service
            </h2>
            <p>
              We reserve the right to modify or discontinue features of the Service with or without notice. We will provide reasonable notice for major changes affecting stored user history or account policies.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
