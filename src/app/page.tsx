"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import Link from "next/link";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLElement>(null);

  // Redirect authenticated users straight to dashboard
  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  // Anime.js entrance animations
  useEffect(() => {
    if (loading) return;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { animate, onScroll } = await import("animejs");

      // Hero entrance
      animate(".hero-eyebrow", {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 700,
        delay: 100,
        easing: "easeOutQuart",
      });
      animate(".hero-headline", {
        opacity: [0, 1],
        translateY: [30, 0],
        duration: 800,
        delay: 250,
        easing: "easeOutQuart",
      });
      animate(".hero-sub", {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 700,
        delay: 450,
        easing: "easeOutQuart",
      });
      animate(".hero-cta", {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 600,
        delay: 600,
        easing: "easeOutQuart",
      });
      animate(".hero-visual", {
        opacity: [0, 1],
        translateY: [40, 0],
        scale: [0.97, 1],
        duration: 900,
        delay: 700,
        easing: "easeOutQuart",
      });

      // Scroll-reveal for feature cards
      const featureCards = document.querySelectorAll(".feature-card");
      featureCards.forEach((card, i) => {
        let triggered = false;
        onScroll({
          target: card as HTMLElement,
          enter: "bottom 90%",
          onEnter: () => {
            if (triggered) return;
            triggered = true;
            animate(card, {
              opacity: [0, 1],
              translateY: [30, 0],
              duration: 600,
              delay: i * 80,
              easing: "easeOutQuart",
            });
          },
        });
      });

      // Scroll-reveal for step items
      const stepItems = document.querySelectorAll(".step-item");
      stepItems.forEach((item, i) => {
        let triggered = false;
        onScroll({
          target: item as HTMLElement,
          enter: "bottom 90%",
          onEnter: () => {
            if (triggered) return;
            triggered = true;
            animate(item, {
              opacity: [0, 1],
              translateX: [-20, 0],
              duration: 550,
              delay: i * 100,
              easing: "easeOutQuart",
            });
          },
        });
      });
    })();

    return cleanup;
  }, [loading]);

  return (
    <div className="landing">
      {/* ── Navbar ────────────────────────────────────────────── */}
      <nav className="navbar" role="navigation" aria-label="Main navigation">
        <Link href="/" className="nav-logo" aria-label="Noctra home">
          <NoctraLogo />
        </Link>
        <div className="nav-actions">
          {!loading && !user && (
            <button
              className="nav-signin-btn"
              onClick={() => document.getElementById("hero-cta")?.scrollIntoView({ behavior: "smooth" })}
            >
              Sign in
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="hero" ref={heroRef} aria-label="Hero">
        {/* Ambient glow */}
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-glow hero-glow-2" aria-hidden="true" />

        <div className="hero-content">
          <p className="hero-eyebrow">Dark mode document converter</p>

          <h1 className="hero-headline">
            Your documents were never{" "}
            <span className="gradient-text">designed for dark mode.</span>
            <br />
            Noctra was.
          </h1>

          <p className="hero-sub">
            Upload a PDF or PowerPoint. Noctra intelligently transforms it into
            a comfortable dark-mode version — preserving your text, diagrams,
            and images.
          </p>

          <div className="hero-cta" id="hero-cta">
            {!loading && !user ? (
              <div className="hero-cta-inner">
                <GoogleSignInButton label="Get started free — Sign in with Google" />
                <p className="hero-cta-note">No account setup · No credit card</p>
              </div>
            ) : null}
          </div>

          {/* Before/after visual */}
          <div className="hero-visual" aria-hidden="true">
            <BeforeAfterVisual />
          </div>
        </div>
      </section>

      {/* ── Flow steps ────────────────────────────────────────── */}
      <section className="steps-section" ref={stepsRef} aria-label="How it works">
        <div className="section-inner">
          <p className="section-eyebrow">How it works</p>
          <h2 className="section-title">Four steps to dark mode</h2>

          <div className="steps-grid">
            {STEPS.map((step, i) => (
              <div className="step-item" key={step.label}>
                <div className="step-num" aria-hidden="true">{i + 1}</div>
                <div className="step-icon" aria-hidden="true">{step.icon}</div>
                <h3 className="step-label">{step.label}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────── */}
      <section className="features-section" ref={featuresRef} aria-label="Features">
        <div className="section-inner">
          <p className="section-eyebrow">What makes Noctra different</p>
          <h2 className="section-title">Intelligent, not destructive</h2>
          <p className="section-sub">
            Most dark-mode hacks just invert every pixel. Noctra analyses your
            document and transforms each element type appropriately.
          </p>

          <div className="features-grid">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.title}>
                <div className="feature-icon" aria-hidden="true">{f.icon}</div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported formats ─────────────────────────────────── */}
      <section className="formats-section" aria-label="Supported formats">
        <div className="section-inner formats-inner">
          <div className="format-badge">
            <PDFIcon />
            <span>PDF</span>
          </div>
          <div className="formats-arrow" aria-hidden="true">→</div>
          <div className="format-badge">
            <PPTXIcon />
            <span>PPTX</span>
          </div>
          <div className="formats-text">
            <h2 className="formats-headline">
              Two formats, one conversion engine
            </h2>
            <p className="formats-sub">
              Upload study PDFs or lecture slides in PowerPoint format.
              Both get the same intelligent dark-mode treatment.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────── */}
      <section className="bottom-cta" aria-label="Call to action">
        <div className="section-inner bottom-cta-inner">
          <h2 className="bottom-cta-title">
            Study comfortably in the dark.
          </h2>
          <p className="bottom-cta-sub">
            Join students who study without straining their eyes.
          </p>
          {!loading && !user && (
            <div className="bottom-cta-btn">
              <GoogleSignInButton label="Start converting — it's free" />
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="footer">
        <div className="footer-inner">
          <NoctraLogo />
          <p className="footer-copy">
            © 2026 Noctra. Built for students.
          </p>
        </div>
      </footer>

      {/* ── Styles ────────────────────────────────────────────── */}
      <style jsx>{`
        .landing {
          min-height: 100vh;
          background: var(--bg-base);
          color: var(--text-primary);
        }

        /* Navbar */
        .navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 40px;
          background: rgba(12, 12, 20, 0.8);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border-subtle);
        }
        .nav-logo { text-decoration: none; }
        .nav-signin-btn {
          padding: 8px 20px;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          color: var(--text-primary);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 150ms, border-color 150ms;
        }
        .nav-signin-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--border-strong);
        }

        /* Hero */
        .hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          overflow: hidden;
          padding: 120px 40px 80px;
        }
        .hero-glow {
          position: absolute;
          width: 600px;
          height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(124, 109, 255, 0.12) 0%, transparent 70%);
          top: 5%;
          left: -10%;
          pointer-events: none;
        }
        .hero-glow-2 {
          background: radial-gradient(circle, rgba(79, 143, 255, 0.08) 0%, transparent 70%);
          top: 30%;
          right: -5%;
        }
        .hero-content {
          max-width: 760px;
          margin: 0 auto;
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .hero-eyebrow {
          font-size: 0.8125rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent-purple);
          margin-bottom: 20px;
          opacity: 0;
        }
        .hero-headline {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 800;
          line-height: 1.12;
          letter-spacing: -0.03em;
          margin-bottom: 24px;
          opacity: 0;
        }
        .hero-sub {
          font-size: 1.125rem;
          color: var(--text-secondary);
          line-height: 1.7;
          max-width: 580px;
          margin: 0 auto 36px;
          opacity: 0;
        }
        .hero-cta { opacity: 0; }
        .hero-cta-inner {
          max-width: 360px;
          margin: 0 auto;
        }
        .hero-cta-note {
          font-size: 0.8125rem;
          color: var(--text-muted);
          margin-top: 10px;
          text-align: center;
        }
        .hero-visual {
          margin-top: 64px;
          opacity: 0;
        }

        /* Section base */
        .section-inner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 0 40px;
        }
        .section-eyebrow {
          font-size: 0.8125rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent-purple);
          margin-bottom: 12px;
        }
        .section-title {
          font-size: clamp(1.5rem, 3vw, 2.25rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 16px;
        }
        .section-sub {
          color: var(--text-secondary);
          max-width: 560px;
          line-height: 1.7;
          margin-bottom: 48px;
        }

        /* Steps */
        .steps-section {
          padding: 100px 0;
          border-top: 1px solid var(--border-subtle);
        }
        .steps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 32px;
          margin-top: 48px;
        }
        .step-item {
          position: relative;
          padding: 28px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          opacity: 0;
        }
        .step-num {
          position: absolute;
          top: 16px;
          right: 20px;
          font-size: 2rem;
          font-weight: 800;
          color: var(--border-default);
          line-height: 1;
        }
        .step-icon {
          width: 44px;
          height: 44px;
          background: var(--accent-purple-dim);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-purple);
          margin-bottom: 20px;
        }
        .step-label {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .step-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        /* Features */
        .features-section {
          padding: 100px 0;
          border-top: 1px solid var(--border-subtle);
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }
        .feature-card {
          padding: 28px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          transition: border-color 200ms, box-shadow 200ms;
          opacity: 0;
        }
        .feature-card:hover {
          border-color: var(--border-default);
          box-shadow: var(--shadow-glow);
        }
        .feature-icon {
          width: 44px;
          height: 44px;
          background: var(--accent-purple-dim);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-purple);
          margin-bottom: 18px;
        }
        .feature-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .feature-desc {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.6;
        }

        /* Formats */
        .formats-section {
          padding: 100px 0;
          border-top: 1px solid var(--border-subtle);
        }
        .formats-inner {
          display: flex;
          align-items: center;
          gap: 32px;
          flex-wrap: wrap;
        }
        .format-badge {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 28px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .formats-arrow {
          font-size: 1.5rem;
          color: var(--text-muted);
        }
        .formats-text { flex: 1; min-width: 280px; }
        .formats-headline {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 10px;
        }
        .formats-sub {
          color: var(--text-secondary);
          line-height: 1.7;
        }

        /* Bottom CTA */
        .bottom-cta {
          padding: 120px 0;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-surface);
        }
        .bottom-cta-inner {
          text-align: center;
        }
        .bottom-cta-title {
          font-size: clamp(1.75rem, 4vw, 2.75rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          margin-bottom: 16px;
        }
        .bottom-cta-sub {
          color: var(--text-secondary);
          font-size: 1.0625rem;
          margin-bottom: 36px;
        }
        .bottom-cta-btn {
          max-width: 360px;
          margin: 0 auto;
        }

        /* Footer */
        .footer {
          border-top: 1px solid var(--border-subtle);
          padding: 32px 40px;
        }
        .footer-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .footer-copy {
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        /* Mobile */
        @media (max-width: 640px) {
          .navbar { padding: 14px 20px; }
          .hero { padding: 100px 20px 60px; }
          .section-inner { padding: 0 20px; }
          .formats-inner { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </div>
  );
}

// ─── Before/After visual ──────────────────────────────────────────────────

function BeforeAfterVisual() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      gap: "16px",
      alignItems: "center",
      maxWidth: 680,
      margin: "0 auto",
    }}>
      {/* Before */}
      <div style={{
        background: "#f8f8fc",
        borderRadius: 12,
        padding: "20px",
        border: "1px solid #e0e0e0",
      }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffbd2e" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28ca42" }} />
        </div>
        <div style={{ background: "#1a1a2a", height: 10, borderRadius: 4, marginBottom: 8, width: "60%" }} />
        <div style={{ background: "#333", height: 8, borderRadius: 4, marginBottom: 6, width: "100%" }} />
        <div style={{ background: "#333", height: 8, borderRadius: 4, marginBottom: 6, width: "85%" }} />
        <div style={{ background: "#333", height: 8, borderRadius: 4, marginBottom: 14, width: "92%" }} />
        <div style={{ background: "#e8e8ff", height: 60, borderRadius: 6, border: "1px solid #d0d0f0" }} />
        <p style={{ color: "#aaa", fontSize: "0.75rem", marginTop: 10, textAlign: "center" }}>Before</p>
      </div>

      {/* Arrow */}
      <div style={{ color: "var(--accent-purple)", fontSize: "1.5rem" }}>→</div>

      {/* After */}
      <div style={{
        background: "#12121e",
        borderRadius: 12,
        padding: "20px",
        border: "1px solid rgba(124, 109, 255, 0.3)",
        boxShadow: "0 0 30px rgba(124, 109, 255, 0.1)",
      }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ffbd2e" }} />
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#28ca42" }} />
        </div>
        <div style={{ background: "#a0a0ff", height: 10, borderRadius: 4, marginBottom: 8, width: "60%" }} />
        <div style={{ background: "#c8c8d8", height: 8, borderRadius: 4, marginBottom: 6, width: "100%" }} />
        <div style={{ background: "#c8c8d8", height: 8, borderRadius: 4, marginBottom: 6, width: "85%" }} />
        <div style={{ background: "#c8c8d8", height: 8, borderRadius: 4, marginBottom: 14, width: "92%" }} />
        <div style={{ background: "#1e1e30", height: 60, borderRadius: 6, border: "1px solid rgba(124,109,255,0.25)" }} />
        <p style={{ color: "#5a5a72", fontSize: "0.75rem", marginTop: 10, textAlign: "center" }}>After · Noctra</p>
      </div>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────

const STEPS = [
  {
    label: "Upload",
    desc: "Drag and drop your PDF or PowerPoint. No size limits that matter for real documents.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    label: "Analyse",
    desc: "Noctra inspects each page, identifying text, backgrounds, images, and diagrams.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    label: "Transform",
    desc: "Text and backgrounds become dark-mode. Images and diagrams stay visually intact.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    label: "Download",
    desc: "Get your transformed document instantly. No waiting, no emails, no account required.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    ),
  },
];

const FEATURES = [
  {
    title: "Smart background detection",
    desc: "White and near-white backgrounds are replaced with our carefully tuned dark palette — not a simple invert.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
    ),
  },
  {
    title: "Text readability preserved",
    desc: "Dark text becomes off-white. The contrast ratio stays high so you can read comfortably.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    title: "Images stay recognisable",
    desc: "Photos, diagrams, charts, and screenshots are protected. They're dimmed slightly but never inverted or destroyed.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    title: "PPTX stays editable",
    desc: "PowerPoint conversions are structural — the XML is patched, not rasterised. Your slides remain fully editable.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    title: "All processing in your browser",
    desc: "Your documents never leave your device. No server upload, no privacy risk.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: "Reduced-motion aware",
    desc: "All animations respect your system's reduced-motion preference. No strobing, no distraction.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
      </svg>
    ),
  },
];

// ─── Inline SVG icons ─────────────────────────────────────────────────────

function NoctraLogo() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="url(#logo-grad-lp)" />
        <path d="M8 24L16 8L24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 19H21.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="logo-grad-lp" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7C6DFF" /><stop offset="1" stopColor="#4F8FFF" />
          </linearGradient>
        </defs>
      </svg>
      <span style={{ fontWeight: 700, fontSize: "1.125rem", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
        Noctra
      </span>
    </span>
  );
}

function PDFIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4f8fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function PPTXIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}
