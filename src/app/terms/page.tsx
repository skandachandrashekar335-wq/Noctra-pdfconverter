import { LegalLayout, type LegalSectionItem } from "@/components/LegalLayout";

const TERMS_SECTIONS: LegalSectionItem[] = [
  { id: "acceptance", number: "01", title: "Acceptance of Terms" },
  { id: "ownership", number: "02", title: "Intellectual Property & Document Ownership" },
  { id: "acceptable-use", number: "03", title: "Permitted & Acceptable Use" },
  { id: "warranties", number: "04", title: "Disclaimer of Warranties" },
  { id: "liability", number: "05", title: "Limitation of Liability" },
  { id: "modifications", number: "06", title: "Modifications to Service" },
];

export default function TermsOfServicePage() {
  return (
    <LegalLayout
      category="User Agreement &amp; Terms"
      title="Terms of Service"
      subtitle="The contractual terms and usage policies governing your access to Noctra, client-side document conversions, and the Study AI platform."
      lastUpdated="October 2026"
      version="Noctra 3.0 Platform"
      readTime="4 min read"
      sections={TERMS_SECTIONS}
      counterpartLink={{
        href: "/privacy",
        label: "Privacy Policy",
      }}
    >
      {/* ── Section 1: Acceptance ────────────────────────────────────── */}
      <section id="acceptance" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">01</span>
          <h2 className="legal-section-title">Acceptance of Terms</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Welcome to Noctra. By accessing or using our web application, conversion engine, Study AI features, or authenticated dashboard (collectively referred to as the &quot;<strong className="legal-strong">Service</strong>&quot;), you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
          </p>
          <p>
            If you do not agree to all terms and conditions set forth herein, you must immediately discontinue use of the Service. These terms constitute a legally binding agreement between you (&quot;<strong className="legal-strong">User</strong>&quot; or &quot;<strong className="legal-strong">you</strong>&quot;) and Noctra.
          </p>
        </div>
      </section>

      {/* ── Section 2: IP & Ownership ────────────────────────────────── */}
      <section id="ownership" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">02</span>
          <h2 className="legal-section-title">Intellectual Property &amp; Document Ownership</h2>
        </div>
        <div className="legal-section-body">
          <p>
            We believe that your study materials, research papers, and lecture slides belong exclusively to you. Noctra&apos;s technical architecture is purposefully designed to guarantee your ownership:
          </p>

          <div className="legal-callout-card is-emerald">
            <h3 className="legal-callout-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>100% User Ownership &amp; Zero Copyright Claim</span>
            </h3>
            <p className="legal-callout-text">
              <strong className="legal-strong">You retain unrestricted, perpetual copyright, intellectual property rights, and ownership</strong> over all files uploaded to Noctra, all dark-mode converted document outputs, annotations, and generated study aids. Because transformations run locally inside your browser, <strong className="legal-strong">Noctra does not acquire any license, ownership, or commercial rights</strong> to your document contents.
            </p>
          </div>

          <p>
            The Noctra visual identity, software source code, logos, visual dark-mode inversion algorithms, and user interface designs are the intellectual property of Noctra and its developer, protected by copyright and intellectual property treaties.
          </p>
        </div>
      </section>

      {/* ── Section 3: Acceptable Use ────────────────────────────────── */}
      <section id="acceptable-use" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">03</span>
          <h2 className="legal-section-title">Permitted &amp; Acceptable Use</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Noctra is provided to assist students, educators, and professionals in studying documents in comfortable, accessible dark mode. You agree to use the Service in compliance with all applicable laws and respect the following boundaries:
          </p>

          <ul className="legal-list">
            <li className="legal-list-item">
              <span className="legal-bullet is-cross">✕</span>
              <div>
                <strong className="legal-strong">No Illegal or Infringing Content:</strong> You may not use the Service to process or distribute materials that violate copyright laws, trademark rights, or contain defamatory, obscene, or unlawful material.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-cross">✕</span>
              <div>
                <strong className="legal-strong">No Security Circumvention:</strong> You may not probe, reverse-engineer, exploit, or attempt to bypass server-side rate limits, user authentication boundaries, or API security policies.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-cross">✕</span>
              <div>
                <strong className="legal-strong">No Infrastructure Abuse or DoS:</strong> You may not launch automated denial-of-service attacks, flood API endpoints with high-volume synthetic requests, or disrupt service availability for other users.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-cross">✕</span>
              <div>
                <strong className="legal-strong">No Malicious Payloads:</strong> You may not craft or upload intentionally corrupted files designed to exploit browser rendering engines, trigger buffer overflows, or execute malicious code.
              </div>
            </li>
            <li className="legal-list-item">
              <span className="legal-bullet is-cross">✕</span>
              <div>
                <strong className="legal-strong">Responsible AI Study Prompting:</strong> When utilizing the AI Study Assistant, you agree not to submit prompts designed to generate hate speech, harassment, or violate public AI safety standards.
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* ── Section 4: Warranties ────────────────────────────────────── */}
      <section id="warranties" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">04</span>
          <h2 className="legal-section-title">Disclaimer of Warranties</h2>
        </div>
        <div className="legal-section-body">
          <p>
            The Service is provided strictly on an &quot;<strong className="legal-strong">AS IS</strong>&quot; and &quot;<strong className="legal-strong">AS AVAILABLE</strong>&quot; basis, without warranties of any kind, whether express, statutory, or implied, including but not limited to the implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
          </p>

          <div className="legal-callout-card is-amber">
            <h3 className="legal-callout-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>Conversion &amp; AI Fidelity Notice</span>
            </h3>
            <p className="legal-callout-text">
              While our color inversion, contrast normalization, and WebAssembly rendering algorithms undergo continuous automated regression testing across thousands of documents, we do not warrant that output visual inversion or layout reproduction will be 100% error-free for every arbitrary, scanned, or non-standard document file.
            </p>
          </div>

          <p>
            Furthermore, AI Study Assistant outputs (including practice exams, quiz questions, explanations, and flashcards) are educational study aids synthesized from document passages. Noctra does not guarantee that AI-generated responses are free from factual inaccuracies or model hallucinations. Study aids should complement, not replace, authoritative textbooks and accredited instruction.
          </p>
        </div>
      </section>

      {/* ── Section 5: Liability ─────────────────────────────────────── */}
      <section id="liability" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">05</span>
          <h2 className="legal-section-title">Limitation of Liability</h2>
        </div>
        <div className="legal-section-body">
          <p>
            To the maximum extent permitted by applicable law, in no event shall Noctra, its developer, contributors, or infrastructure partners be liable for any indirect, incidental, special, exemplary, consequential, or punitive damages whatsoever, including without limitation damages for loss of profits, data corruption, study interruption, or equipment malfunction, arising out of or in connection with your use of or inability to use the Service.
          </p>
          <p>
            If applicable law does not permit the exclusion of certain warranties or liability limitations, our liability shall be limited to the fullest extent permitted by such law.
          </p>
        </div>
      </section>

      {/* ── Section 6: Modifications ─────────────────────────────────── */}
      <section id="modifications" className="legal-section">
        <div className="legal-section-header">
          <span className="legal-section-num">06</span>
          <h2 className="legal-section-title">Modifications to Service &amp; Terms</h2>
        </div>
        <div className="legal-section-body">
          <p>
            Noctra is actively developed. We reserve the right to refine, update, or temporarily suspend features, rate limits, or supported conversion formats with or without prior notice.
          </p>
          <p>
            We may revise these Terms of Service periodically. When substantial changes occur that affect stored user history or account policies, we will update the &quot;Last Updated&quot; date at the top of this document and provide reasonable in-app notification where appropriate. Continued use of Noctra following published revisions constitutes your binding acceptance of the updated terms.
          </p>
        </div>
      </section>
    </LegalLayout>
  );
}
