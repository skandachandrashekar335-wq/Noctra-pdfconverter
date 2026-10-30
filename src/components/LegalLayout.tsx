"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export interface LegalSectionItem {
  id: string;
  number: string;
  title: string;
}

export interface LegalLayoutProps {
  category?: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  version?: string;
  readTime?: string;
  sections: LegalSectionItem[];
  counterpartLink: {
    href: string;
    label: string;
  };
  children: ReactNode;
}

export function LegalLayout({
  category = "Legal Documentation",
  title,
  subtitle,
  lastUpdated,
  version = "Noctra 3.0 Platform",
  readTime = "5 min read",
  sections,
  counterpartLink,
  children,
}: LegalLayoutProps) {
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id || "");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const copyrightYear = "2026";

  // Track active section with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSectionId(entry.target.id);
          }
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSectionId(id);
      setMobileTocOpen(false);
    }
  };

  return (
    <div className="legal-shell">
      {/* ── Top Header Navigation ─────────────────────────────────────── */}
      <header className="legal-header">
        <div className="legal-header-inner">
          <div className="legal-header-brand">
            <Link href="/" className="legal-brand-link" aria-label="Noctra homepage">
              <Image
                src="/noctra-logo.png"
                alt="Noctra logo"
                width={28}
                height={28}
                className="legal-brand-logo"
                priority
              />
              <span className="legal-brand-name">NOCTRA</span>
            </Link>
            <span className="legal-brand-divider" aria-hidden="true">/</span>
            <span className="legal-brand-crumb">{title}</span>
          </div>

          <div className="legal-header-actions">
            <Link href={counterpartLink.href} className="legal-counterpart-link">
              <span>{counterpartLink.label}</span>
              <span aria-hidden="true">→</span>
            </Link>
            <div className="legal-theme-wrap">
              <ThemeToggle />
            </div>
            <Link href="/dashboard" className="legal-cta-btn">
              <span>Open App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Document Hero ────────────────────────────────────────────── */}
      <section className="legal-hero">
        <div className="legal-hero-inner">
          <Link href="/" className="legal-back-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span>Back to Noctra</span>
          </Link>

          <div className="legal-badge-row">
            <span className="legal-category-badge">{category}</span>
            <span className="legal-security-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Local-First Security</span>
            </span>
          </div>

          <h1 className="legal-hero-title">{title}</h1>
          <p className="legal-hero-subtitle">{subtitle}</p>

          <div className="legal-meta-bar">
            <div className="legal-meta-item">
              <span className="legal-meta-label">Last Updated:</span>
              <span className="legal-meta-val">{lastUpdated}</span>
            </div>
            <span className="legal-meta-dot" aria-hidden="true">•</span>
            <div className="legal-meta-item">
              <span className="legal-meta-label">Version:</span>
              <span className="legal-meta-val">{version}</span>
            </div>
            <span className="legal-meta-dot" aria-hidden="true">•</span>
            <div className="legal-meta-item">
              <span className="legal-meta-label">Est. Read:</span>
              <span className="legal-meta-val">{readTime}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mobile Table of Contents Accordion ───────────────────────── */}
      <div className="legal-mobile-toc-bar">
        <button
          type="button"
          onClick={() => setMobileTocOpen((v) => !v)}
          className="legal-mobile-toc-btn"
          aria-expanded={mobileTocOpen}
          aria-controls="mobile-toc-dropdown"
        >
          <div className="legal-mobile-toc-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <span>Table of Contents</span>
          </div>
          <span className="legal-mobile-toc-toggle-icon">{mobileTocOpen ? "▲" : "▼"}</span>
        </button>

        {mobileTocOpen && (
          <nav id="mobile-toc-dropdown" className="legal-mobile-toc-dropdown" aria-label="Mobile table of contents">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                className={`legal-mobile-toc-item ${activeSectionId === s.id ? "is-active" : ""}`}
              >
                <span className="legal-toc-num">{s.number}</span>
                <span className="legal-toc-text">{s.title}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* ── Main Two-Column Document Grid ────────────────────────────── */}
      <div className="legal-container">
        <div className="legal-grid">
          {/* Main Reading Column */}
          <main className="legal-content" role="main">
            {children}
          </main>

          {/* Desktop Sticky Table of Contents */}
          <aside className="legal-sidebar" aria-label="Table of contents">
            <div className="legal-sticky-card">
              <h2 className="legal-toc-heading">Contents</h2>
              <nav className="legal-toc-nav">
                {sections.map((s) => {
                  const isActive = activeSectionId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollToSection(s.id)}
                      className={`legal-toc-link ${isActive ? "is-active" : ""}`}
                      aria-current={isActive ? "location" : undefined}
                    >
                      <span className="legal-toc-num">{s.number}</span>
                      <span className="legal-toc-title">{s.title}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="legal-sidebar-cta">
                <span className="legal-sidebar-badge">Privacy First</span>
                <p className="legal-sidebar-note">
                  Noctra runs PDF, Word and PowerPoint transforms inside your browser session.
                </p>
                <Link href="/dashboard" className="legal-sidebar-link">
                  Open Converter <span>→</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── Reusable Legal Footer ─────────────────────────────────────── */}
      <footer className="legal-footer">
        <div className="legal-footer-inner">
          <div className="legal-footer-top">
            <div className="legal-footer-brand">
              <span className="legal-footer-wordmark">NOCTRA</span>
              <p className="legal-footer-desc">
                High-fidelity, privacy-preserving document dark mode. Client-side conversion for PDFs, DOCX, and PPTX with inverted visual contrast, readable typography, and optional AI study aids.
              </p>
            </div>

            <div className="legal-footer-links-grid">
              <div className="legal-footer-col">
                <h3 className="legal-footer-head">Legal &amp; Policy</h3>
                <ul className="legal-footer-list">
                  <li><Link href="/privacy">Privacy Policy</Link></li>
                  <li><Link href="/terms">Terms of Service</Link></li>
                  <li><Link href="/dashboard">Security Settings</Link></li>
                </ul>
              </div>

              <div className="legal-footer-col">
                <h3 className="legal-footer-head">Product</h3>
                <ul className="legal-footer-list">
                  <li><Link href="/dashboard">Document Converter</Link></li>
                  <li><Link href="/dashboard">Library &amp; Reader</Link></li>
                  <li><Link href="/dashboard">Study AI Workspace</Link></li>
                </ul>
              </div>

              <div className="legal-footer-col">
                <h3 className="legal-footer-head">Creator</h3>
                <div className="legal-footer-creator">
                  <p className="legal-creator-name">Skanda Chandrashekar</p>
                  <p className="legal-creator-role">Creator of Noctra</p>
                  <a
                    href="https://github.com/skandachandrashekar335-wq"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="legal-github-link"
                    aria-label="GitHub profile of Skanda Chandrashekar"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span>GitHub Profile</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="legal-footer-bottom">
            <p className="legal-footer-copy">
              © {copyrightYear} Noctra. All documents stay on your device.
            </p>
            <div className="legal-footer-bottom-links">
              <Link href="/privacy">Privacy Policy</Link>
              <span aria-hidden="true">•</span>
              <Link href="/terms">Terms of Service</Link>
              <span aria-hidden="true">•</span>
              <Link href="/">Home</Link>
            </div>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .legal-shell {
          min-height: 100vh;
          background: var(--bg-base);
          color: var(--text-primary);
          font-family: var(--font-body);
          display: flex;
          flex-direction: column;
        }

        /* ── Header ── */
        .legal-header {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(17, 17, 20, 0.82);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-subtle);
        }
        .legal-header-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .legal-header-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .legal-brand-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: var(--text-primary);
        }
        .legal-brand-logo {
          border-radius: var(--radius-sm);
        }
        .legal-brand-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: 0.08em;
          color: var(--text-primary);
        }
        .legal-brand-divider {
          color: var(--border-default);
          font-weight: 300;
        }
        .legal-brand-crumb {
          font-size: 0.8125rem;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .legal-header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .legal-counterpart-link {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-secondary);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: color var(--transition-fast);
        }
        .legal-counterpart-link:hover {
          color: var(--accent-purple);
        }
        .legal-theme-wrap {
          display: flex;
          align-items: center;
        }
        .legal-cta-btn {
          padding: 6px 14px;
          border-radius: var(--radius-pill);
          background: var(--accent-purple);
          color: #ffffff;
          font-size: 0.8125rem;
          font-weight: 600;
          text-decoration: none;
          transition: background var(--transition-fast), transform var(--transition-fast);
        }
        .legal-cta-btn:hover {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }

        /* ── Hero ── */
        .legal-hero {
          background: linear-gradient(180deg, rgba(124, 109, 255, 0.04) 0%, rgba(17, 17, 20, 0) 100%);
          border-bottom: 1px solid var(--border-subtle);
          padding: 48px 24px 40px;
        }
        .legal-hero-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .legal-back-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--accent-purple);
          text-decoration: none;
          margin-bottom: 20px;
          transition: color var(--transition-fast);
        }
        .legal-back-link:hover {
          color: var(--accent-hover);
        }
        .legal-badge-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .legal-category-badge {
          display: inline-flex;
          align-items: center;
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          background: rgba(124, 109, 255, 0.12);
          border: 1px solid rgba(124, 109, 255, 0.28);
          color: var(--accent-purple);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .legal-security-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: var(--radius-pill);
          background: rgba(52, 211, 153, 0.1);
          border: 1px solid rgba(52, 211, 153, 0.28);
          color: #86efac;
          font-size: 0.6875rem;
          font-weight: 600;
        }
        .legal-hero-title {
          font-family: var(--font-display);
          font-size: clamp(2rem, 4vw, 2.75rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text-primary);
          line-height: 1.15;
          margin: 0 0 12px;
        }
        .legal-hero-subtitle {
          font-size: 1rem;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 48rem;
          margin: 0 0 24px;
        }
        .legal-meta-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.75rem;
          color: var(--text-muted);
          flex-wrap: wrap;
        }
        .legal-meta-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .legal-meta-label {
          color: var(--text-muted);
        }
        .legal-meta-val {
          color: var(--text-secondary);
          font-weight: 600;
        }
        .legal-meta-dot {
          color: var(--border-default);
        }

        /* ── Mobile TOC Bar ── */
        .legal-mobile-toc-bar {
          display: none;
          background: var(--bg-surface);
          border-bottom: 1px solid var(--border-subtle);
          padding: 12px 20px;
        }
        @media (max-width: 1023px) {
          .legal-mobile-toc-bar {
            display: block;
            position: sticky;
            top: 57px;
            z-index: 30;
          }
        }
        .legal-mobile-toc-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 0;
        }
        .legal-mobile-toc-label {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-primary);
        }
        .legal-mobile-toc-toggle-icon {
          font-size: 0.625rem;
          color: var(--text-muted);
        }
        .legal-mobile-toc-dropdown {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          margin-top: 10px;
        }
        .legal-mobile-toc-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: none;
          text-align: left;
          color: var(--text-secondary);
          font-size: 0.75rem;
          cursor: pointer;
          transition: background var(--transition-fast), color var(--transition-fast);
        }
        .legal-mobile-toc-item.is-active,
        .legal-mobile-toc-item:hover {
          background: rgba(124, 109, 255, 0.1);
          color: var(--text-primary);
        }
        .legal-toc-num {
          font-family: monospace;
          font-size: 0.6875rem;
          font-weight: 700;
          color: var(--accent-purple);
          opacity: 0.9;
        }
        .legal-toc-text {
          line-height: 1.4;
        }

        /* ── Container & Grid ── */
        .legal-container {
          flex: 1;
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          padding: 48px 24px 80px;
        }
        .legal-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          gap: 56px;
          align-items: start;
        }
        @media (max-width: 1023px) {
          .legal-grid {
            grid-template-columns: 1fr;
            gap: 32px;
          }
        }

        /* ── Reading Column ── */
        .legal-content {
          max-width: 820px;
          width: 100%;
        }

        /* ── Section & Document Typography ── */
        .legal-content :global(.legal-section) {
          scroll-margin-top: 100px;
          margin-bottom: 48px;
          padding-bottom: 40px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .legal-content :global(.legal-section:last-of-type) {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .legal-content :global(.legal-section-header) {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 18px;
        }
        .legal-content :global(.legal-section-num) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 3px 8px;
          border-radius: var(--radius-sm);
          background: rgba(124, 109, 255, 0.12);
          border: 1px solid rgba(124, 109, 255, 0.28);
          color: var(--accent-purple);
          font-family: monospace;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.05em;
        }
        .legal-content :global(.legal-section-title) {
          font-family: var(--font-body);
          font-size: clamp(1.25rem, 2.5vw, 1.5rem);
          font-weight: 700;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          margin: 0;
        }
        .legal-content :global(.legal-section-body) {
          font-size: 0.9375rem;
          line-height: 1.75;
          color: var(--text-secondary);
        }
        .legal-content :global(.legal-section-body p) {
          margin: 0 0 16px;
        }
        .legal-content :global(.legal-section-body p:last-child) {
          margin-bottom: 0;
        }
        .legal-content :global(.legal-strong) {
          color: var(--text-primary);
          font-weight: 600;
        }
        .legal-content :global(.legal-callout-card) {
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-left: 3px solid var(--accent-purple);
          border-radius: var(--radius-md);
          padding: 20px 24px;
          margin: 20px 0;
        }
        .legal-content :global(.legal-callout-card.is-emerald) {
          border-left-color: #34d399;
          background: rgba(52, 211, 153, 0.04);
        }
        .legal-content :global(.legal-callout-card.is-amber) {
          border-left-color: #f59e0b;
          background: rgba(245, 158, 11, 0.04);
        }
        .legal-content :global(.legal-callout-title) {
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 6px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .legal-content :global(.legal-callout-text) {
          font-size: 0.875rem;
          line-height: 1.65;
          color: var(--text-secondary);
          margin: 0;
        }
        .legal-content :global(.legal-list) {
          list-style: none;
          padding: 0;
          margin: 16px 0 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .legal-content :global(.legal-list-item) {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--text-secondary);
        }
        .legal-content :global(.legal-bullet) {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(124, 109, 255, 0.15);
          color: var(--accent-purple);
          font-size: 0.75rem;
          flex-shrink: 0;
          margin-top: 3px;
        }
        .legal-content :global(.legal-bullet.is-check) {
          background: rgba(52, 211, 153, 0.15);
          color: #34d399;
        }
        .legal-content :global(.legal-bullet.is-cross) {
          background: rgba(248, 113, 113, 0.15);
          color: #f87171;
        }
        .legal-content :global(.legal-code) {
          font-family: monospace;
          font-size: 0.8125rem;
          padding: 2px 6px;
          border-radius: var(--radius-sm);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border-subtle);
          color: #c4b5fd;
        }
        .legal-content :global(.legal-tier-grid) {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 20px 0;
        }
        @media (max-width: 640px) {
          .legal-content :global(.legal-tier-grid) {
            grid-template-columns: 1fr;
          }
        }
        .legal-content :global(.legal-tier-card) {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .legal-content :global(.legal-tier-num) {
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent-purple);
        }
        .legal-content :global(.legal-tier-name) {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .legal-content :global(.legal-tier-model) {
          font-family: monospace;
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        /* ── Desktop Sticky Sidebar ── */
        .legal-sidebar {
          display: block;
        }
        @media (max-width: 1023px) {
          .legal-sidebar {
            display: none;
          }
        }
        .legal-sticky-card {
          position: sticky;
          top: 96px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: 22px;
          box-shadow: var(--shadow-card);
        }
        .legal-toc-heading {
          font-family: var(--font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin: 0 0 14px;
        }
        .legal-toc-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .legal-toc-link {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-secondary);
          font-size: 0.8125rem;
          line-height: 1.4;
          text-align: left;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .legal-toc-link:hover {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
        }
        .legal-toc-link.is-active {
          background: rgba(124, 109, 255, 0.12);
          border-color: rgba(124, 109, 255, 0.28);
          color: var(--text-primary);
          font-weight: 600;
        }
        .legal-toc-link.is-active .legal-toc-num {
          color: #a78bfa;
        }
        .legal-toc-title {
          flex: 1;
        }
        .legal-sidebar-cta {
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid var(--border-subtle);
        }
        .legal-sidebar-badge {
          display: inline-block;
          font-size: 0.625rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #34d399;
          margin-bottom: 6px;
        }
        .legal-sidebar-note {
          font-size: 0.75rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin: 0 0 10px;
        }
        .legal-sidebar-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--accent-purple);
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        .legal-sidebar-link:hover {
          color: var(--accent-hover);
        }

        /* ── Reusable Footer ── */
        .legal-footer {
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          padding: 60px 24px 36px;
          margin-top: auto;
        }
        .legal-footer-inner {
          max-width: 1200px;
          margin: 0 auto;
        }
        .legal-footer-top {
          display: grid;
          grid-template-columns: 1.4fr 2fr;
          gap: 48px;
          margin-bottom: 48px;
        }
        @media (max-width: 768px) {
          .legal-footer-top {
            grid-template-columns: 1fr;
            gap: 36px;
          }
        }
        .legal-footer-wordmark {
          font-family: var(--font-display);
          font-size: 1.125rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--text-primary);
          display: inline-block;
          margin-bottom: 12px;
        }
        .legal-footer-desc {
          font-size: 0.8125rem;
          color: var(--text-muted);
          line-height: 1.6;
          max-width: 26rem;
          margin: 0;
        }
        .legal-footer-links-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
        @media (max-width: 640px) {
          .legal-footer-links-grid {
            grid-template-columns: 1fr;
            gap: 24px;
          }
        }
        .legal-footer-head {
          font-family: var(--font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin: 0 0 14px;
        }
        .legal-footer-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .legal-footer-list li :global(a) {
          color: var(--text-secondary);
          font-size: 0.8125rem;
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        .legal-footer-list li :global(a:hover) {
          color: var(--accent-purple);
        }
        .legal-footer-creator {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .legal-creator-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }
        .legal-creator-role {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0 0 8px;
        }
        .legal-github-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--accent-purple);
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        .legal-github-link:hover {
          color: var(--accent-hover);
        }
        .legal-footer-bottom {
          padding-top: 24px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
          color: var(--text-muted);
          flex-wrap: wrap;
          gap: 12px;
        }
        .legal-footer-copy {
          margin: 0;
        }
        .legal-footer-bottom-links {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .legal-footer-bottom-links :global(a) {
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        .legal-footer-bottom-links :global(a:hover) {
          color: var(--text-primary);
        }

        /* ── Responsive Refinements ── */
        @media (max-width: 640px) {
          .legal-header-inner {
            padding: 12px 16px;
          }
          .legal-brand-divider,
          .legal-brand-crumb,
          .legal-counterpart-link {
            display: none;
          }
          .legal-hero {
            padding: 32px 16px 28px;
          }
          .legal-container {
            padding: 28px 16px 60px;
          }
        }
      `}</style>
    </div>
  );
}
