"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getLandingCtaMode } from "@/lib/landing-cta";
import {
  CONVERSION_PROFILES,
  type ConversionProfile,
} from "@/lib/conversion-profiles";

/* ──────────────────────────────────────────────────────────────────────────
   Shared data — every claim below maps to code that exists in this repo
   (src/lib/pdf-converter.ts, pptx-converter.ts, pdf-text-layer.ts,
   validation.ts, conversion.ts).
   ────────────────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { href: "#philosophy", label: "Philosophy" },
  { href: "#showcase", label: "Showcase" },
  { href: "#themes", label: "Themes" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

const PRINCIPLES = [
  {
    index: "01",
    title: "Preserve",
    body: "Keep diagrams, photos, and important visual information readable.",
  },
  {
    index: "02",
    title: "Transform",
    body: "Adapt backgrounds and text for a dark reading experience.",
  },
  {
    index: "03",
    title: "Keep control",
    body: "Download the converted file yourself — nothing is kept for you.",
  },
];

const FEATURES = [
  {
    geo: "square",
    title: "Intelligent document conversion",
    body: "Pages are rendered at 2× and transformed by pixel classification — text, fills, and low-saturation shapes are remapped, not blanket-inverted.",
    cta: "Convert a document",
  },
  {
    geo: "stack",
    title: "Editable PPTX conversion",
    body: "Slides are patched at the XML level, so your presentation stays fully editable in PowerPoint after the dark theme is applied.",
    cta: "Convert a deck",
  },
  {
    geo: "ring",
    title: "Editable DOCX conversion",
    body: "Word packages are patched structurally, preserving editable text, styles, equations, relationships and original media where supported.",
    cta: "Convert a document",
  },
  {
    geo: "sweep",
    title: "The Dark Sweep preview",
    body: "Live visual proof for every page. Watch real render thumbnails sweep from light to dark in real time before downloading.",
    cta: "See the preview",
    href: "#showcase",
  },
  {
    geo: "grid",
    title: "Local browser processing",
    body: "PDF.js and JSZip do the work on your device. Your document is never sent to a conversion server.",
    cta: "Read the workflow",
    href: "#philosophy",
  },
  {
    geo: "lines",
    title: "Searchable PDF output",
    body: "Converted PDFs carry an invisible text layer, so the result stays selectable, searchable, and copy-pasteable.",
    cta: "Convert a PDF",
  },
  {
    geo: "link",
    title: "Hyperlinks preserved",
    body: "External links, mailto links, and internal page jumps are rebuilt as real PDF link annotations — not flattened into pixels.",
    cta: "Convert a PDF",
  },
  {
    geo: "diamond",
    title: "Image-aware preservation",
    body: "Photographs, diagrams, charts, and screenshots are preserved and only slightly dimmed, so they stay visually useful.",
    cta: "See the showcase",
    href: "#showcase",
  },
  {
    geo: "palette",
    title: "Four tailored reading palettes",
    body: "Choose OLED Black for lowest glare, Charcoal Dark for soft contrast, Warm Sepia for long study sessions, or Low-Contrast Night.",
    cta: "Compare palettes",
    href: "#themes",
  },
];

const FOOTER_NAV = [
  { href: "#philosophy", label: "Philosophy" },
  { href: "#showcase", label: "Showcase" },
  { href: "#themes", label: "Themes" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

const FOOTER_PRODUCT = [
  { href: "#features", label: "Supported formats" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/auth/login", label: "Sign in / Register" },
];

/* Concise FAQ — every answer reflects what the code actually does. */
const FAQS = [
  {
    q: "Do my documents get uploaded to a server?",
    a: "No. Conversion runs entirely in your browser with PDF.js and JSZip. Your file never leaves your device — there is no upload step and no conversion server.",
  },
  {
    q: "Which formats are supported?",
    a: "PDF, DOCX and PPTX in. PDF converts to a dark-mode PDF with a live text layer; DOCX and PPTX stay fully editable after the dark theme is applied.",
  },
  {
    q: "Are images and diagrams affected?",
    a: "Photographs, charts and screenshots are preserved and only slightly dimmed — they are never blanket-inverted, so they stay visually useful.",
  },
  {
    q: "Can I choose the dark theme?",
    a: "Yes. Pick from OLED Black, Charcoal Dark, Warm Sepia or Low-Contrast Night before converting. The theme you select is the palette applied to your output.",
  },
  {
    q: "Is there a file-size limit?",
    a: "Files up to 50 MB are supported. Larger documents may be slow to process on low-power devices because everything runs locally.",
  },
];

/* ──────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const { user, loading, error, configError } = useAuth();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyrightYear, setCopyrightYear] = useState("");
  const [authRedirectPending, setAuthRedirectPending] = useState(false);
  // Interactive theme preview — defaults to the same profile the converter
  // uses, so what's previewed is exactly what a conversion would apply.
  const [previewProfile, setPreviewProfile] = useState<ConversionProfile>(
    CONVERSION_PROFILES[0]
  );

  // The button may unmount as soon as AuthProvider observes the new user. Keep
  // the redirect state in this public page so successful sign-in cannot lose
  // its navigation effect during that render transition.
  useEffect(() => {
    if (authRedirectPending && user) router.push("/dashboard");
  }, [authRedirectPending, router, user]);

  const handleAuthSuccess = useCallback(() => {
    setAuthRedirectPending(true);
  }, []);

  useEffect(() => {
    // Deferred to a timer callback: the year is read client-side only, so the
    // static prerender never sees `new Date()`, and no state update happens
    // synchronously inside the effect body.
    const id = window.setTimeout(
      () => setCopyrightYear(String(new Date().getFullYear())),
      0
    );
    return () => window.clearTimeout(id);
  }, []);

  // Close the mobile menu when the viewport grows past the breakpoint.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* Anime.js v4 entrance + scroll choreography.
     Everything created here is pushed into `disposables` and reverted on
     unmount; `cancelled` prevents a late dynamic import from touching a
     component that is no longer mounted. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Respect the user's motion preference — CSS keeps the reveal elements
    // fully visible when reduce is requested.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const disposables: Array<{ revert: () => void }> = [];

    // Fail-safe: if the animation bundle can't load, show everything.
    const revealAll = () => {
      root
        .querySelectorAll<HTMLElement>("[data-hero], [data-reveal], [data-echo]")
        .forEach((el) => {
          el.style.opacity = "1";
        });
      root.querySelectorAll<HTMLElement>("[data-clip]").forEach((el) => {
        el.style.clipPath = "none";
      });
    };

    // Second fail-safe: if the engine stalls (throttled rAF in a background
    // tab, a thrown render, …) nothing may ever reach its end state. The hero
    // animates immediately on load, so if it is still hidden when the timer
    // fires the engine never ticked — reveal everything, including the
    // attribute-driven clip state. If the hero revealed normally, the engine
    // is alive and scroll reveals are left to run on their own.
    const failsafe = window.setTimeout(() => {
      if (cancelled) return;
      const hero = root.querySelector<HTMLElement>("[data-hero]");
      if (!hero || parseFloat(getComputedStyle(hero).opacity) >= 0.99) return;
      root
        .querySelectorAll<HTMLElement>("[data-hero], [data-reveal], [data-echo]")
        .forEach((el) => {
          el.style.opacity = "1";
          el.style.transform = "";
        });
      root.querySelectorAll<HTMLElement>("[data-clip]").forEach((el) => {
        el.style.clipPath = "none";
      });
    }, 6000);

    (async () => {
      try {
        const { animate, onScroll, stagger, cubicBezier } = await import(
          "animejs"
        );
        if (cancelled) return;

        const editorialEase = cubicBezier(0.77, 0, 0.175, 1);

        /* ── Hero entrance ──────────────────────────────────────────── */
        const heroTargets = Array.from(
          root.querySelectorAll<HTMLElement>("[data-hero]")
        );
        if (heroTargets.length) {
          disposables.push(
            animate(heroTargets, {
              opacity: [0, 1],
              translateY: [26, 0],
              duration: 720,
              delay: stagger(80),
              ease: "outQuart",
            })
          );
        }

        /* ── Typographic echo stack reveal ──────────────────────────── */
        const echoes = Array.from(
          root.querySelectorAll<HTMLElement>("[data-echo]")
        );
        if (echoes.length) {
          disposables.push(
            animate(echoes, {
              opacity: [0, 1],
              translateX: [-14, 0],
              duration: 900,
              delay: stagger(70),
              ease: editorialEase,
            })
          );
        }

        /* ── Section entrances + image clip-path reveals ────────────── */
        const revealables = Array.from(
          root.querySelectorAll<HTMLElement>("[data-reveal]")
        );

        revealables.forEach((el, i) => {
          const isClip = el.hasAttribute("data-clip");
          const inViewNow =
            el.getBoundingClientRect().top < window.innerHeight * 0.92;

          const run = (delay = 0) => {
            disposables.push(
              animate(el, {
                opacity: [0, 1],
                translateY: isClip ? [0, 0] : [30, 0],
                ...(isClip
                  ? { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"] }
                  : {}),
                duration: 700,
                delay,
                ease: editorialEase,
                onComplete: () => {
                  // Release the reveal attributes so hover transitions and the
                  // resting clip state are not held hostage by the entry styles.
                  el.removeAttribute("data-reveal");
                  el.removeAttribute("data-clip");
                  el.style.clipPath = "none";
                },
              })
            );
          };

          if (inViewNow) {
            run(i * 60);
          } else {
            let fired = false;
            disposables.push(
              onScroll({
                target: el,
                enter: "bottom 90%",
                onEnter: () => {
                  if (fired || cancelled) return;
                  fired = true;
                  run(0);
                },
              })
            );
          }
        });
      } catch (err) {
        console.error("Animation init failed:", err);
        if (!cancelled) revealAll();
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      disposables.forEach((d) => {
        try {
          d.revert();
        } catch {
          /* observer already torn down */
        }
      });
    };
  }, []);

  const ctaMode = getLandingCtaMode(loading, Boolean(user));
  const signedIn = ctaMode === "authenticated";
  const authMessage = error ?? configError;

  return (
    <div className="landing" ref={rootRef}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="site-header">
        <div className="shell header-inner">
          <a href="#top" className="wordmark" aria-label="Noctra — back to top">
            <Image
              src="/noctra-logo.png"
              alt=""
              width={30}
              height={30}
              className="wordmark-icon"
              priority
            />
            <span>NOCTRA</span>
          </a>

          <nav className="nav-desktop" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="nav-link">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="header-actions">
            <ThemeToggle className="header-theme" />
            {ctaMode === "resolving-session" ? (
              <span
                className="pill-cta pill-cta--pending"
                role="status"
                aria-live="polite"
              >
                Checking session…
              </span>
            ) : ctaMode === "authenticated" ? (
              <Link href="/dashboard" className="pill-cta">
                Get started
              </Link>
            ) : (
              <GoogleSignInButton
                label="Get started"
                variant="compact"
                showError={false}
                onSuccess={handleAuthSuccess}
              />
            )}
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="menu-toggle-bars" aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="sr-only">
                {menuOpen ? "Close menu" : "Open menu"}
              </span>
            </button>
          </div>
        </div>

        <div
          id="mobile-nav"
          className={`mobile-nav ${menuOpen ? "is-open" : ""}`}
          hidden={!menuOpen}
        >
          <nav aria-label="Mobile">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="mobile-nav-link"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            {ctaMode === "resolving-session" ? (
              <span
                className="mobile-nav-link mobile-nav-link--cta"
                role="status"
                aria-live="polite"
              >
                Checking session…
              </span>
            ) : ctaMode === "authenticated" ? (
              <Link
                href="/dashboard"
                className="mobile-nav-link mobile-nav-link--cta"
                onClick={() => setMenuOpen(false)}
              >
                Open dashboard
              </Link>
            ) : (
              <GoogleSignInButton
                label="Sign in with Google"
                variant="nav"
                showError={false}
                onStart={() => setMenuOpen(false)}
                onSuccess={handleAuthSuccess}
              />
            )}
          </nav>
        </div>
      </header>

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="shell hero-inner">
            <p className="hero-eyebrow" data-hero>
              Dark mode for study documents
            </p>

            {/* Typographic Echo Stack — the four background layers are pure
                decoration: aria-hidden, pointer-events none, and the headline
                itself below is the only text a screen reader receives. */}
            <div className="hero-lockup">
              <div className="echo-stack" aria-hidden="true">
                <span className="echo echo--1" data-echo>
                  YOUR DOCUMENTS
                  <br />
                  WERE NEVER DESIGNED
                  <br />
                  FOR DARK MODE.
                </span>
                <span className="echo echo--2" data-echo>
                  YOUR DOCUMENTS
                  <br />
                  WERE NEVER DESIGNED
                  <br />
                  FOR DARK MODE.
                </span>
                <span className="echo echo--3" data-echo>
                  YOUR DOCUMENTS
                  <br />
                  WERE NEVER DESIGNED
                  <br />
                  FOR DARK MODE.
                </span>
                <span className="echo echo--4" data-echo>
                  YOUR DOCUMENTS
                  <br />
                  WERE NEVER DESIGNED
                  <br />
                  FOR DARK MODE.
                </span>
              </div>

              <h1 className="hero-title" id="hero-title" data-hero>
                YOUR DOCUMENTS
                <br />
                WERE NEVER DESIGNED
                <br />
                FOR DARK MODE.
              </h1>
            </div>

            <p className="hero-sub" data-hero>
              <span className="hero-sub-lead">NOCTRA WAS.</span>{" "}
               Bright study documents, transformed into comfortable
              dark-mode versions — in your browser, on your device.{" "}
              <span className="hero-sub-lead">
                Made for the dark. Optimized for OLED.
              </span>
            </p>

            <div className="hero-actions" id="hero-cta" data-hero>
              {ctaMode === "resolving-session" ? (
                <span
                  className="pill-cta pill-cta--solid pill-cta--pending"
                  role="status"
                  aria-live="polite"
                >
                  Checking session…
                </span>
              ) : signedIn ? (
                <Link href="/dashboard" className="pill-cta pill-cta--solid">
                  Transform your documents
                </Link>
              ) : (
                <GoogleSignInButton
                  label="Transform your documents"
                  className="hero-cta-inner"
                  showError={false}
                  onSuccess={handleAuthSuccess}
                />
              )}
              <a href="#philosophy" className="text-cta">
                See how it works
                <span className="text-cta-arrow" aria-hidden="true">
                  ↓
                </span>
              </a>
              {authMessage && (
                <p
                  className="landing-auth-feedback"
                  role="alert"
                  aria-live="assertive"
                >
                  {authMessage}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Philosophy ───────────────────────────────────────────────── */}
        <section
          className="philosophy"
          id="philosophy"
          aria-labelledby="philosophy-title"
        >
          <div className="shell">
            <div className="hairline" aria-hidden="true" data-reveal />

            <div className="philosophy-head">
              <p className="section-label" data-reveal>
                The principle
              </p>
              <h2 className="philosophy-title" id="philosophy-title" data-reveal>
                Less glare.
                <br />
                More <span className="serif-em">focus</span>.
              </h2>
              <p className="philosophy-lead" data-reveal>
                Your study material should work with your eyes, not against
                them.
              </p>
            </div>

            <div className="hairline" aria-hidden="true" data-reveal />

            <ul className="principle-grid">
              {PRINCIPLES.map((p) => (
                <li key={p.title} className="principle" data-reveal>
                  <span className="principle-index" aria-hidden="true">
                    {p.index}
                  </span>
                  <h3 className="principle-title">{p.title}</h3>
                  <p className="principle-body">{p.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Product showcase ─────────────────────────────────────────── */}
        <section
          className="showcase"
          id="showcase"
          aria-labelledby="showcase-title"
        >
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="section-label" data-reveal>
                  The product
                </p>
                <h2 className="section-title" id="showcase-title" data-reveal>
                  What Noctra
                  <br />
                  actually does
                </h2>
              </div>
              <p className="section-note" data-reveal>
                Built from the real converter — no stock photography, no mockups.
              </p>
            </div>

            <div className="showcase-grid">
              {/* Large landscape: bright original vs dark transformed */}
              <article className="sc-card sc-card--wide" data-clip data-reveal>
                <div className="sc-media">
                  <div className="doc-split">
                    <figure className="doc-page doc-page--light">
                      <div className="doc-page-tag">Bright original</div>
                      <div className="doc-hline doc-hline--title" />
                      <div className="doc-hline" />
                      <div className="doc-hline doc-hline--short" />
                      <div className="doc-chart" aria-hidden="true">
                        <span style={{ height: "38%" }} />
                        <span style={{ height: "72%" }} />
                        <span style={{ height: "54%" }} />
                        <span style={{ height: "88%" }} />
                      </div>
                      <div className="doc-hline" />
                      <div className="doc-hline doc-hline--short" />
                    </figure>

                    <div className="doc-arrow" aria-hidden="true">
                      <span />
                    </div>

                    <figure className="doc-page doc-page--dark">
                      <div className="doc-page-tag">Dark transformed</div>
                      <div className="doc-hline doc-hline--title" />
                      <div className="doc-hline" />
                      <div className="doc-hline doc-hline--short" />
                      <div className="doc-chart" aria-hidden="true">
                        <span style={{ height: "38%" }} />
                        <span style={{ height: "72%" }} />
                        <span style={{ height: "54%" }} />
                        <span style={{ height: "88%" }} />
                      </div>
                      <div className="doc-hline" />
                      <div className="doc-hline doc-hline--short" />
                    </figure>
                  </div>
                </div>
                <div className="sc-body">
                  <h3 className="sc-title">Bright in. Dark out.</h3>
                  <p className="sc-text">
                    The same document before and after — backgrounds remapped,
                    layout untouched.
                  </p>
                </div>
              </article>

              {/* Tall pill: image & diagram preservation */}
              <article className="sc-card sc-card--pill" data-clip data-reveal>
                <div className="sc-media sc-media--tall">
                  <div className="diagram" aria-hidden="true">
                    <div className="diagram-orbit">
                      <span className="diagram-node diagram-node--a" />
                      <span className="diagram-node diagram-node--b" />
                      <span className="diagram-node diagram-node--c" />
                      <span className="diagram-core" />
                    </div>
                    <div className="diagram-plot">
                      <span style={{ height: "44%" }} />
                      <span style={{ height: "78%" }} />
                      <span style={{ height: "60%" }} />
                      <span style={{ height: "92%" }} />
                      <span style={{ height: "52%" }} />
                    </div>
                    <div className="diagram-caption">figure 3 — pipeline</div>
                  </div>
                </div>
                <div className="sc-body">
                  <h3 className="sc-title">Images &amp; diagrams preserved</h3>
                  <p className="sc-text">
                    Photographs, charts, and screenshots are dimmed — never
                    inverted.
                  </p>
                </div>
              </article>

              {/* Circular: formats */}
              <article className="sc-card sc-card--circle" data-clip data-reveal>
                <div className="sc-media sc-media--circle">
                  <div className="format-wheel" aria-hidden="true">
                    <span className="format-chip">PDF</span>
                    <span className="format-divider" />
                    <span className="format-chip">DOCX</span>
                    <span className="format-chip">PPTX</span>
                  </div>
                </div>
                <div className="sc-body sc-body--center">
                  <h3 className="sc-title">Three formats</h3>
                  <p className="sc-text">
                     PDF, DOCX or PPTX in. One dark-mode result out.
                  </p>
                </div>
              </article>

              {/* Wide landscape: text layer + links */}
              <article className="sc-card sc-card--band" data-clip data-reveal>
                <div className="sc-media">
                  <div className="textlayer" aria-hidden="true">
                    <p className="textlayer-line">
                      Chapter 4 — <mark>selectable, searchable text</mark>
                    </p>
                    <p className="textlayer-line textlayer-line--muted">
                      The invisible text layer keeps every page copy-pasteable.
                    </p>
                    <p className="textlayer-line">
                      <span className="textlayer-link">
                        Read the source reference
                      </span>
                      <span className="textlayer-link textlayer-link--internal">
                        jump to page 12
                      </span>
                    </p>
                    <div className="textlayer-selection" />
                  </div>
                </div>
                <div className="sc-body">
                  <h3 className="sc-title">Real text. Live links.</h3>
                  <p className="sc-text">
                    Hyperlinks and internal jumps are rebuilt as PDF
                    annotations, so navigation survives the conversion.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ── Interactive theme preview ───────────────────────────────── */}
        <section
          className="themes"
          id="themes"
          aria-labelledby="themes-title"
        >
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="section-label" data-reveal>
                  Your theme
                </p>
                <h2 className="section-title" id="themes-title" data-reveal>
                  Pick your
                  <br />
                  darkness
                </h2>
              </div>
              <p className="section-note" data-reveal>
                These are the exact palettes the converter applies — preview one
                here, then use it on your own document.
              </p>
            </div>

            <div className="theme-layout">
              {/* Profile chooser — real ConversionProfile data */}
              <div
                className="theme-list"
                role="group"
                aria-label="Choose a dark theme to preview"
              >
                {CONVERSION_PROFILES.map((p) => {
                  const active = p.id === previewProfile.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`theme-item ${active ? "is-active" : ""}`}
                      aria-pressed={active}
                      onClick={() => setPreviewProfile(p)}
                    >
                      <span
                        className="theme-swatch"
                        aria-hidden="true"
                        style={{
                          background: rgbToCss(p.background),
                          borderColor: rgbToCss(p.surface),
                        }}
                      >
                        <span
                          className="theme-swatch-accent"
                          style={{ background: rgbToCss(p.accent) }}
                        />
                      </span>
                      <span className="theme-item-text">
                        <span className="theme-item-label">{p.label}</span>
                        <span className="theme-item-desc">{p.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Live preview — rendered with the selected profile's colors */}
              <div
                className="theme-preview"
                aria-live="polite"
                aria-label={`${previewProfile.label} preview`}
              >
                <div
                  className="tp-doc"
                  style={{
                    background: rgbToCss(previewProfile.background),
                    borderColor: rgbToCss(previewProfile.surface),
                  }}
                >
                  <div
                    className="tp-tag"
                    style={{ color: rgbToCss(previewProfile.text), opacity: 0.6 }}
                  >
                    {previewProfile.label}
                  </div>
                  <div
                    className="tp-line tp-line--title"
                    style={{ background: rgbToCss(previewProfile.text) }}
                  />
                  <div
                    className="tp-line"
                    style={{
                      background: rgbToCss(previewProfile.text),
                      opacity: 0.55,
                    }}
                  />
                  <div
                    className="tp-line tp-line--short"
                    style={{
                      background: rgbToCss(previewProfile.text),
                      opacity: 0.55,
                    }}
                  />
                  <div className="tp-chart" aria-hidden="true">
                    {[38, 72, 54, 88].map((h, i) => (
                      <span
                        key={i}
                        style={{
                          height: `${h}%`,
                          background: rgbToCss(
                            i % 2 === 0 ? previewProfile.accent : previewProfile.surface
                          ),
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="tp-line"
                    style={{
                      background: rgbToCss(previewProfile.text),
                      opacity: 0.55,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section
          className="features"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="shell">
            <div className="section-head">
              <div>
                <p className="section-label" data-reveal>
                  Capabilities
                </p>
                <h2 className="section-title" id="features-title" data-reveal>
                  Everything the
                  <br />
                  converter really does
                </h2>
              </div>
              <a href="#hero-cta" className="text-cta text-cta--standalone" data-reveal>
                Start converting
                <span className="text-cta-arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            </div>

            <ul className="feature-grid">
              {FEATURES.map((f) => (
                <li key={f.title} className="feature-card" data-reveal>
                  <span
                    className={`geo geo--${f.geo}`}
                    aria-hidden="true"
                  >
                    <span className="geo-mark" />
                  </span>
                  <h3 className="feature-title">{f.title}</h3>
                  <p className="feature-body">{f.body}</p>
                  <a
                    href={f.href ?? (signedIn ? "/dashboard" : "#hero-cta")}
                    className="feature-link"
                    aria-label={`${f.cta} — ${f.title}`}
                  >
                    <span className="feature-link-label">{f.cta}</span>
                    <span className="feature-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ + privacy ────────────────────────────────────────────── */}
        <section className="faq" id="faq" aria-labelledby="faq-title">
          <div className="shell">
            <div className="faq-grid">
              <div className="faq-intro">
                <p className="section-label" data-reveal>
                  Questions
                </p>
                <h2 className="section-title" id="faq-title" data-reveal>
                  Good to
                  <br />
                  know
                </h2>
                <div className="privacy-note" data-reveal>
                  <h3 className="privacy-title">Privacy, in plain terms</h3>
                  <p className="privacy-body">
                    Conversion happens on your device. Your document is read by
                    your browser, transformed locally, and handed back to you as
                    a download. It is never sent to a conversion server, and we
                    never see your file.
                  </p>
                </div>
              </div>

              <div className="faq-list">
                {FAQS.map((f) => (
                  <details key={f.q} className="faq-item" data-reveal>
                    <summary className="faq-q">
                      {f.q}
                      <span className="faq-caret" aria-hidden="true" />
                    </summary>
                    <p className="faq-a">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────── */}
        <section className="closing" aria-labelledby="closing-title">
          <div className="shell closing-inner">
            <p className="section-label section-label--light" data-reveal>
              Ready when you are
            </p>
            <h2 className="closing-title" id="closing-title" data-reveal>
              Turn the lights down.
              <br />
              Keep reading.
            </h2>
            <div className="closing-actions" data-reveal>
              {ctaMode === "resolving-session" ? (
                <span
                  className="pill-cta pill-cta--invert pill-cta--pending"
                  role="status"
                  aria-live="polite"
                >
                  Checking session…
                </span>
              ) : signedIn ? (
                <Link href="/dashboard" className="pill-cta pill-cta--invert">
                  Transform your documents
                </Link>
              ) : (
                <GoogleSignInButton
                  label="Transform your documents"
                  className="closing-cta-inner"
                  variant="invert"
                  showError={false}
                  onSuccess={handleAuthSuccess}
                />
              )}
              <a href="#features" className="text-cta text-cta--invert">
                Review the features
                <span className="text-cta-arrow" aria-hidden="true">
                  ↑
                </span>
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="site-footer">
        <div className="shell footer-grid">
          <div className="footer-brand">
            <span className="footer-wordmark">NOCTRA</span>
            <p className="footer-desc">
               Dark mode for study documents. Bright PDFs, Word documents and PowerPoints are
              transformed locally in your browser — text, diagrams, images, and
              links intact.
            </p>
          </div>

          <nav className="footer-col" aria-label="Footer — sections">
            <h2 className="footer-heading">Sections</h2>
            <ul>
              {FOOTER_NAV.map((l) => (
                <li key={l.href}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="footer-col" aria-label="Footer — product">
            <h2 className="footer-heading">Product</h2>
            <ul>
              <li>
                {ctaMode === "resolving-session" ? (
                  <span
                    className="footer-auth-pending"
                    role="status"
                    aria-live="polite"
                  >
                    Checking session…
                  </span>
                ) : signedIn ? (
                  <Link href="/dashboard">Open the converter</Link>
                ) : (
                  <GoogleSignInButton
                    label="Open the converter"
                    variant="footer"
                    showError={false}
                    onSuccess={handleAuthSuccess}
                  />
                )}
              </li>
              <li>
                {ctaMode === "resolving-session" ? (
                  <span
                    className="footer-auth-pending"
                    role="status"
                    aria-live="polite"
                  >
                    Checking session…
                  </span>
                ) : signedIn ? (
                  <Link href="/dashboard">Account dashboard</Link>
                ) : (
                  <GoogleSignInButton
                    label="Sign in with Google"
                    variant="footer"
                    showError={false}
                    onSuccess={handleAuthSuccess}
                  />
                )}
              </li>
              {FOOTER_PRODUCT.map((l) => (
                <li key={l.label}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="footer-col">
            <h2 className="footer-heading">Formats</h2>
            <ul>
              <li>
                <span className="footer-static">PDF → dark PDF</span>
              </li>
              <li>
                <span className="footer-static">DOCX → dark DOCX</span>
              </li>
              <li>
                <span className="footer-static">PPTX → dark PPTX</span>
              </li>
              <li>
                <span className="footer-static">Up to 50 MB per file</span>
              </li>
            </ul>
          </div>

          <div className="footer-col footer-creator-col">
            <h2 className="footer-heading">Created By</h2>
            <div className="footer-creator-body">
              <p className="footer-creator-name">Skanda Chandrashekar</p>
              <p className="footer-creator-role">Developer &amp; Creator of Noctra</p>
              <a
                href="https://github.com/skandachandrashekar335-wq"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-github-link"
                aria-label="GitHub profile of Skanda Chandrashekar (opens in a new tab)"
              >
                <svg
                  className="footer-github-icon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>GitHub</span>
              </a>
              <p className="footer-creator-note">
                Designed &amp; built with care by Skanda.
              </p>
            </div>
          </div>
        </div>

        <div className="shell footer-base">
          {/* The year is read in an effect — `new Date()` at render time is an
              unstable value that blocks static prerendering. */}
          <p>© {copyrightYear} Noctra. Documents stay on your device.</p>
          <div className="footer-legal">
            <Link href="/privacy">Privacy Policy</Link>
            <span aria-hidden="true">•</span>
            <Link href="/terms">Terms of Service</Link>
          </div>
        </div>
      </footer>

      <style jsx>{`
        /* ══ Layout shell ══════════════════════════════════════════════ */
        .landing {
          background: var(--bg-base);
          color: var(--text-primary);
          overflow-x: clip;
        }
        .shell {
          width: 100%;
          max-width: var(--shell-max);
          margin-inline: auto;
          padding-inline: clamp(20px, 5vw, 48px);
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
          border: 0;
        }

        /* ══ Header ════════════════════════════════════════════════════ */
        .site-header {
          position: sticky;
          top: 0;
          z-index: 60;
          background: var(--surface-scrim);
          border-bottom: 1px solid var(--border-hairline);
        }
        /* The minifier collapses backdrop-filter into its -webkit- alias,
           which Chrome does not honour for computed style. Wrapping it in a
           supports query preserves the standard property. */
        @supports ((backdrop-filter: blur(12px)) or (-webkit-backdrop-filter: blur(12px))) {
          .site-header {
            -webkit-backdrop-filter: blur(12px);
            backdrop-filter: blur(12px);
          }
        }
        .header-inner {
          height: var(--nav-h);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }
        .wordmark {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.25rem;
          letter-spacing: -0.05em;
          color: var(--text-primary);
          text-decoration: none;
        }
        .wordmark-icon {
          border-radius: 8px;
          object-fit: cover;
        }
        .nav-desktop {
          display: none;
          gap: clamp(18px, 3vw, 38px);
        }
        .nav-link {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-secondary);
          text-decoration: none;
          padding-block: 6px;
          border-bottom: 1px solid transparent;
          transition: color var(--transition-fast),
            border-color var(--transition-fast);
        }
        .nav-link:hover {
          color: var(--text-primary);
          border-bottom-color: var(--text-primary);
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        /* Pill CTA — brand violet fill that inverts to an outline on hover */
        .pill-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 44px;
          padding-inline: 22px;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-pill);
          background: transparent;
          color: var(--text-primary);
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          text-decoration: none;
          white-space: nowrap;
          cursor: pointer;
          transition: background var(--transition-fast),
            color var(--transition-fast), border-color var(--transition-fast);
        }
        .pill-cta:hover {
          background: var(--text-primary);
          border-color: var(--text-primary);
          color: var(--bg-base);
        }
        .pill-cta--solid {
          background: var(--accent-purple);
          border-color: var(--accent-purple);
          color: #ffffff;
        }
        .pill-cta--solid:hover {
          background: var(--accent-hover);
          border-color: var(--accent-hover);
          color: #ffffff;
        }
        .pill-cta--invert {
          background: var(--text-primary);
          border-color: var(--text-primary);
          color: var(--bg-base);
        }
        .pill-cta--invert:hover {
          background: transparent;
          color: var(--text-primary);
        }
        .pill-cta--pending {
          cursor: wait;
          opacity: 0.62;
        }

        .menu-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          background: transparent;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-pill);
          cursor: pointer;
        }
        .menu-toggle-bars {
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 16px;
        }
        .menu-toggle-bars span {
          display: block;
          height: 1px;
          background: var(--text-primary);
        }
        .mobile-nav {
          border-top: 1px solid var(--border-hairline);
          background: var(--surface-scrim-strong);
          padding: 8px clamp(20px, 5vw, 48px) 20px;
        }
        .mobile-nav nav {
          display: flex;
          flex-direction: column;
        }
        .mobile-nav-link {
          padding: 16px 0;
          font-size: 0.8125rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-primary);
          text-decoration: none;
          border-bottom: 1px solid var(--border-hairline);
        }
        .mobile-nav-link--cta {
          border-bottom: 0;
          color: var(--accent-purple);
        }

        @media (min-width: 900px) {
          .nav-desktop {
            display: flex;
          }
          .menu-toggle {
            display: none;
          }
          .mobile-nav {
            display: none;
          }
        }

        /* ══ Hero ══════════════════════════════════════════════════════ */
        .hero {
          padding-top: clamp(56px, 9vw, 120px);
          padding-bottom: clamp(64px, 10vw, 132px);
        }
        .hero-eyebrow {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: clamp(24px, 4vw, 44px);
        }
        .hero-lockup {
          position: relative;
        }
        .hero-title {
          position: relative;
          z-index: 2;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2.1rem, 8.4vw, 7.25rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin: 0;
        }
        /* Typographic Echo Stack — four decorative repetitions, offset ~0.04em
           each, entirely non-interactive and hidden from assistive tech. */
        .echo-stack {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          user-select: none;
        }
        .echo {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2.1rem, 8.4vw, 7.25rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          will-change: transform;
        }
        /* Stack offsets live in top/left, not transform: the entrance
           animation owns transform (animejs only reads inline transforms,
           so a stylesheet transform would be clobbered at completion). */
        .echo--1 {
          top: 0.04em;
          left: 0.04em;
          color: var(--echo-1);
        }
        .echo--2 {
          top: 0.08em;
          left: 0.08em;
          color: var(--echo-2);
        }
        .echo--3 {
          top: 0.12em;
          left: 0.12em;
          color: var(--echo-3);
        }
        .echo--4 {
          top: 0.16em;
          left: 0.16em;
          color: var(--echo-4);
        }
        .hero-sub {
          margin-top: clamp(32px, 5vw, 56px);
          max-width: 58ch;
          font-size: clamp(1rem, 1.4vw, 1.1875rem);
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .hero-sub-lead {
          display: inline-block;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.35em;
          letter-spacing: -0.05em;
          color: var(--text-primary);
        }
        .hero-actions {
          margin-top: clamp(32px, 5vw, 48px);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 20px 28px;
          min-height: 60px;
        }
        .hero-cta-inner {
          width: min(420px, 100%);
        }
        .landing-auth-feedback {
          flex: 0 0 100%;
          max-width: 58ch;
          margin-top: -4px;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--accent-bad);
        }

        .text-cta {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-primary);
          text-decoration: none;
          padding-block: 6px;
          border-bottom: 1px solid var(--border-default);
          transition: border-color var(--transition-fast),
            gap var(--transition-fast);
        }
        .text-cta:hover {
          gap: 16px;
          border-bottom-color: var(--text-primary);
        }
        .text-cta-arrow {
          font-size: 0.95em;
          line-height: 1;
        }
        .text-cta--standalone {
          align-self: flex-end;
        }
        .text-cta--invert {
          color: var(--text-primary);
          border-bottom-color: var(--ink-50);
        }
        .text-cta--invert:hover {
          border-bottom-color: var(--text-primary);
        }

        /* ══ Section furniture ═════════════════════════════════════════ */
        .section-label {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 18px;
        }
        .section-label--light {
          color: var(--ink-62);
        }
        .section-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2rem, 5vw, 3.75rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin: 0;
        }
        .section-head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px 48px;
          margin-bottom: clamp(36px, 5vw, 64px);
        }
        .section-note {
          max-width: 34ch;
          font-size: 0.9375rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .hairline {
          height: 1px;
          background: var(--border-hairline);
        }

        /* ══ Philosophy ════════════════════════════════════════════════ */
        .philosophy {
          padding-block: clamp(64px, 9vw, 128px);
        }
        .philosophy-head {
          max-width: 22ch;
          margin: clamp(40px, 6vw, 72px) auto clamp(40px, 6vw, 72px);
          text-align: center;
          position: relative;
        }
        /* thin vertical hairline divider above the heading */
        .philosophy-head::before {
          content: "";
          position: absolute;
          top: calc(-1 * clamp(28px, 4vw, 48px));
          left: 50%;
          width: 1px;
          height: clamp(28px, 4vw, 48px);
          background: var(--border-default);
        }
        .philosophy-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2.5rem, 8vw, 6rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin: 0;
        }
        .philosophy-title .serif-em {
          color: var(--accent-purple);
        }
        .philosophy-lead {
          margin-top: clamp(20px, 3vw, 32px);
          font-size: clamp(1rem, 1.5vw, 1.25rem);
          line-height: 1.55;
          color: var(--text-secondary);
          max-width: 40ch;
          margin-inline: auto;
        }
        .philosophy-head .section-label {
          margin-bottom: 22px;
        }

        .principle-grid {
          list-style: none;
          padding: 0;
          margin: clamp(48px, 7vw, 88px) 0 0;
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          border-top: 1px solid var(--border-hairline);
        }
        .principle {
          padding: clamp(28px, 4vw, 44px) 0;
          border-bottom: 1px solid var(--border-hairline);
        }
        .principle-index {
          display: block;
          font-family: var(--font-display);
          font-weight: 600;
          font-size: 0.8125rem;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin-bottom: 16px;
        }
        .principle-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(1.5rem, 3vw, 2rem);
          line-height: 0.95;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin: 0 0 12px;
        }
        .principle-body {
          font-size: 1rem;
          line-height: 1.6;
          color: var(--text-secondary);
          max-width: 34ch;
        }

        @media (min-width: 800px) {
          .principle-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 0;
            border-bottom: 1px solid var(--border-hairline);
          }
          .principle {
            padding: clamp(32px, 4vw, 48px) clamp(24px, 3vw, 40px);
            border-bottom: 0;
            border-right: 1px solid var(--border-hairline);
          }
          .principle:first-child {
            padding-left: 0;
          }
          .principle:last-child {
            border-right: 0;
            padding-right: 0;
          }
        }

        /* ══ Showcase ══════════════════════════════════════════════════ */
        .showcase {
          padding-block: clamp(64px, 9vw, 128px);
          background: var(--bg-surface);
          border-top: 1px solid var(--border-hairline);
          border-bottom: 1px solid var(--border-hairline);
        }
        .showcase-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(20px, 2.5vw, 28px);
        }
        .sc-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .sc-media {
          position: relative;
          flex: 1;
          padding: clamp(20px, 3vw, 32px);
          min-height: 240px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .sc-media--tall {
          min-height: 300px;
        }
        .sc-media--circle {
          aspect-ratio: 1;
          min-height: 0;
          border-radius: 50%;
          background: var(--bg-inset);
        }
        .sc-body {
          padding: clamp(20px, 3vw, 28px);
          border-top: 1px solid var(--border-subtle);
        }
        .sc-body--center {
          text-align: center;
        }
        .sc-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(1.25rem, 2vw, 1.625rem);
          line-height: 1;
          letter-spacing: -0.04em;
          color: var(--text-primary);
          margin: 0 0 10px;
        }
        .sc-text {
          font-size: 0.9375rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        /* Grayscale → colour is only applied where a hover actually exists,
           so touch devices always see the card at full colour. */
        @media (hover: hover) and (pointer: fine) {
          .sc-media {
            filter: grayscale(1);
            transition: filter var(--transition-slow),
              transform var(--transition-slow);
          }
          .sc-card:hover .sc-media {
            filter: grayscale(0);
            transform: scale(1.02);
          }
        }

        /* — split document preview — */
        .doc-split {
          width: 100%;
          display: flex;
          align-items: center;
          gap: clamp(10px, 1.6vw, 20px);
        }
        .doc-page {
          flex: 1;
          min-width: 0;
          margin: 0;
          border-radius: var(--radius-md);
          padding: clamp(14px, 2vw, 22px);
          display: flex;
          flex-direction: column;
          gap: clamp(7px, 1vw, 11px);
        }
        .doc-page--light {
          background: #ffffff;
          border: 1px solid rgba(17, 17, 17, 0.12);
        }
        .doc-page--dark {
          background: #111114;
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .doc-page-tag {
          font-family: var(--font-body);
          font-size: 0.5625rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .doc-page--light .doc-page-tag {
          color: rgba(17, 17, 17, 0.72);
        }
        .doc-page--dark .doc-page-tag {
          color: rgba(242, 242, 242, 0.55);
        }
        .doc-hline {
          height: 6px;
          border-radius: 2px;
          width: 100%;
        }
        .doc-hline--title {
          height: 10px;
          width: 62%;
        }
        .doc-hline--short {
          width: 44%;
        }
        .doc-page--light .doc-hline {
          background: rgba(17, 17, 17, 0.16);
        }
        .doc-page--light .doc-hline--title {
          background: rgba(17, 17, 17, 0.72);
        }
        .doc-page--dark .doc-hline {
          background: rgba(242, 242, 242, 0.2);
        }
        .doc-page--dark .doc-hline--title {
          background: rgba(242, 242, 242, 0.8);
        }
        .doc-chart {
          display: flex;
          align-items: flex-end;
          gap: 5px;
          height: clamp(52px, 8vw, 84px);
          padding-top: 4px;
        }
        .doc-chart span {
          flex: 1;
          border-radius: 2px 2px 0 0;
          background: #7c6dff;
        }
        .doc-chart span:nth-child(2) {
          background: #4f8fff;
        }
        .doc-chart span:nth-child(3) {
          background: #34d399;
        }
        .doc-chart span:nth-child(4) {
          background: #f59e0b;
        }
        .doc-arrow {
          flex: 0 0 auto;
          width: clamp(26px, 4vw, 46px);
          height: 1px;
          background: var(--border-strong);
          position: relative;
        }
        .doc-arrow span {
          position: absolute;
          right: 0;
          top: 50%;
          width: 7px;
          height: 7px;
          border-top: 1px solid var(--border-strong);
          border-right: 1px solid var(--border-strong);
          transform: translateY(-50%) rotate(45deg);
        }

        /* — tall pill diagram — */
        .diagram {
          width: 100%;
          max-width: 300px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(18px, 3vw, 28px);
        }
        .diagram-orbit {
          position: relative;
          width: clamp(140px, 40%, 170px);
          aspect-ratio: 1;
          border: 1px solid var(--border-default);
          border-radius: 50%;
          display: grid;
          place-items: center;
        }
        .diagram-core {
          width: 34%;
          aspect-ratio: 1;
          border-radius: 50%;
          background: var(--surface-island);
          border: 1px solid var(--landing-border-stronger);
        }
        .diagram-node {
          position: absolute;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #7c6dff;
        }
        .diagram-node--a {
          top: -7px;
          left: 50%;
          transform: translateX(-50%);
        }
        .diagram-node--b {
          bottom: 14%;
          right: -4px;
          background: #4f8fff;
        }
        .diagram-node--c {
          bottom: 14%;
          left: -4px;
          background: #34d399;
        }
        .diagram-plot {
          display: flex;
          align-items: flex-end;
          gap: 6px;
          width: 100%;
          height: clamp(64px, 12vw, 96px);
          padding: 10px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          background: var(--bg-inset);
        }
        .diagram-plot span {
          flex: 1;
          background: var(--violet-55);
          border-radius: 2px 2px 0 0;
        }
        .diagram-plot span:nth-child(2n) {
          background: rgba(79, 143, 255, 0.5);
        }
        .diagram-caption {
          font-family: var(--font-body);
          font-size: 0.625rem;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        /* — circular format wheel — */
        .format-wheel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          /* Chips scale with the wheel itself (container query units); the
             wheel lives in a narrow grid column, so viewport-based sizing
             let the chip stack outgrow the circle on tablet/desktop. (Gap
             stays fixed — a wheel cannot query its own container units.) */
          container-type: inline-size;
          gap: 10px;
          width: 74%;
          aspect-ratio: 1;
          border: 1px solid var(--border-default);
          border-radius: 50%;
        }
        .format-chip {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(0.875rem, 14cqw, 1.75rem);
          letter-spacing: -0.05em;
          color: var(--text-primary);
        }
        .format-divider {
          width: 34px;
          height: 1px;
          background: var(--border-strong);
        }

        /* — wide text-layer band — */
        .textlayer {
          position: relative;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: clamp(12px, 2vw, 18px);
          padding: clamp(20px, 3vw, 32px);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          background: var(--bg-inset);
        }
        .textlayer-line {
          margin: 0;
          font-size: clamp(0.9375rem, 1.5vw, 1.125rem);
          line-height: 1.5;
          color: var(--text-primary);
        }
        .textlayer-line--muted {
          color: var(--text-secondary);
          font-size: 0.9375rem;
        }
        .textlayer-line mark {
          background: var(--violet-30);
          color: inherit;
          padding: 1px 3px;
        }
        .textlayer-link {
          display: inline-block;
          margin-right: 22px;
          color: var(--accent-blue);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .textlayer-link--internal {
          color: var(--accent-purple);
        }
        .textlayer-selection {
          position: absolute;
          right: clamp(18px, 3vw, 30px);
          bottom: clamp(16px, 2.5vw, 26px);
          width: clamp(48px, 8vw, 84px);
          height: 10px;
          background: var(--violet-35);
          border-radius: 2px;
        }

        @media (min-width: 760px) {
          .showcase-grid {
            grid-template-columns: repeat(12, 1fr);
          }
          .sc-card--wide {
            grid-column: span 7;
            min-height: 460px;
          }
          .sc-card--pill {
            grid-column: span 5;
            height: 500px;
          }
          .sc-card--circle {
            grid-column: span 4;
            align-self: start;
            aspect-ratio: auto;
          }
          .sc-card--circle .sc-media--circle {
            aspect-ratio: 1;
            max-width: 340px;
            /* Definite width so the wheel's percentage (and the chips'
               container-query sizes) resolve against the card, not against
               shrink-to-fit content. */
            width: 100%;
            margin-inline: auto;
          }
          .sc-card--band {
            grid-column: span 8;
            min-height: 380px;
          }
        }

        /* ══ Features ══════════════════════════════════════════════════ */
        .features {
          padding-block: clamp(64px, 9vw, 128px);
        }
        .feature-grid {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: 1fr;
          border-top: 1px solid var(--border-subtle);
          border-left: 1px solid var(--border-subtle);
        }
        .feature-card {
          position: relative;
          padding: clamp(28px, 3.5vw, 44px);
          border-right: 1px solid var(--border-subtle);
          border-bottom: 1px solid var(--border-subtle);
          background: transparent;
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: background var(--transition-base);
        }
        .feature-card:hover {
          background: var(--landing-faint);
        }

        /* small geometric marks — CSS only, no icon set */
        .geo {
          display: block;
          width: 46px;
          height: 46px;
          position: relative;
          transition: transform 420ms cubic-bezier(0.77, 0, 0.175, 1);
          margin-bottom: 6px;
        }
        .feature-card:hover .geo {
          transform: rotate(12deg);
        }
        .geo::before,
        .geo::after,
        .geo .geo-mark {
          content: "";
          position: absolute;
          display: block;
        }
        .geo--square::before {
          inset: 0;
          border: 1px solid var(--text-primary);
        }
        .geo--square .geo-mark {
          inset: 12px;
          background: var(--text-primary);
        }
        .geo--stack::before {
          left: 0;
          right: 0;
          top: 6px;
          height: 10px;
          border: 1px solid var(--text-primary);
        }
        .geo--stack::after {
          left: 0;
          right: 0;
          top: 20px;
          height: 10px;
          background: var(--echo-faint-28);
        }
        .geo--stack .geo-mark {
          left: 0;
          right: 0;
          top: 34px;
          height: 10px;
          background: var(--text-primary);
        }
        .geo--ring::before {
          inset: 0;
          border: 1px solid var(--text-primary);
          border-radius: 50%;
        }
        .geo--ring .geo-mark {
          inset: 14px;
          background: var(--text-primary);
          border-radius: 50%;
        }
        .geo--grid::before {
          left: 0;
          top: 0;
          width: 20px;
          height: 20px;
          background: var(--text-primary);
        }
        .geo--grid::after {
          right: 0;
          top: 0;
          width: 20px;
          height: 20px;
          border: 1px solid var(--text-primary);
        }
        .geo--grid .geo-mark {
          left: 0;
          bottom: 0;
          width: 20px;
          height: 20px;
          border: 1px solid var(--text-primary);
        }
        .geo--lines::before {
          left: 0;
          right: 0;
          top: 8px;
          height: 1px;
          background: var(--text-primary);
          box-shadow: 0 9px 0 var(--text-primary), 0 18px 0 var(--echo-faint-40),
            0 27px 0 var(--echo-faint-40);
        }
        .geo--lines .geo-mark {
          display: none;
        }
        .geo--link::before {
          left: 0;
          top: 12px;
          width: 26px;
          height: 12px;
          border: 1px solid var(--text-primary);
          border-radius: 999px;
        }
        .geo--link::after {
          right: 0;
          top: 12px;
          width: 26px;
          height: 12px;
          border: 1px solid var(--text-primary);
          border-radius: 999px;
        }
        .geo--link .geo-mark {
          left: 50%;
          top: 17px;
          width: 8px;
          height: 1px;
          background: var(--text-primary);
          transform: translateX(-50%);
        }
        .geo--sweep::before {
          left: 0;
          top: 4px;
          width: 21px;
          height: 36px;
          border: 1px solid var(--text-primary);
          border-right: none;
        }
        .geo--sweep::after {
          right: 0;
          top: 4px;
          width: 22px;
          height: 36px;
          background: var(--text-primary);
        }
        .geo--sweep .geo-mark {
          left: 21px;
          top: 4px;
          width: 2px;
          height: 36px;
          background: var(--accent-purple);
        }
        .geo--diamond::before {
          inset: 8px;
          border: 1px solid var(--text-primary);
          transform: rotate(45deg);
        }
        .geo--diamond .geo-mark {
          inset: 16px;
          background: var(--text-primary);
          transform: rotate(45deg);
        }
        .geo--palette::before {
          left: 0;
          top: 2px;
          width: 19px;
          height: 19px;
          background: var(--text-primary);
        }
        .geo--palette::after {
          right: 0;
          top: 2px;
          width: 19px;
          height: 19px;
          border: 1px solid var(--text-primary);
        }
        .geo--palette .geo-mark {
          left: 0;
          bottom: 2px;
          width: 19px;
          height: 19px;
          background: var(--echo-faint-28);
        }

        .feature-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(1.2rem, 1.6vw, 1.45rem);
          line-height: 1.15;
          letter-spacing: -0.035em;
          color: var(--text-primary);
          margin: 0;
        }
        .feature-body {
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--text-secondary);
          flex: 1;
        }
        .feature-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
          padding: 6px 0;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-primary);
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        .feature-link:focus-visible {
          outline: 2px solid var(--accent-purple);
          outline-offset: 4px;
          border-radius: 2px;
        }
        .feature-arrow {
          display: inline-block;
          transition: transform var(--transition-base);
          font-size: 0.8125rem;
          color: var(--accent-purple);
        }
        .feature-card:hover .feature-arrow {
          transform: translate(3px, -3px);
        }
        .feature-card:hover,
        .feature-card:focus-within {
          background: var(--landing-faint);
        }
        .feature-link:hover .feature-link-label {
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        @media (min-width: 700px) {
          .feature-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          /* Tablet balanced grid: odd final card spans both columns intentionally */
          .feature-card:last-child:nth-child(odd) {
            grid-column: span 2;
          }
        }
        @media (min-width: 1040px) {
          .feature-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          /* Reset tablet 2-col span on 3-col desktop layout */
          .feature-card:last-child:nth-child(odd) {
            grid-column: auto;
          }
          /* If incomplete row on 3-col: lone card spans full width */
          .feature-card:last-child:nth-child(3n + 1) {
            grid-column: 1 / -1;
          }
          /* If two cards in final row: second card balances across remaining span */
          .feature-card:last-child:nth-child(3n + 2) {
            grid-column: span 2;
          }
        }

        /* ══ Closing CTA ═══════════════════════════════════════════════ */
        .closing {
          background: var(--surface-island);
          color: var(--text-primary);
          border-top: 1px solid var(--landing-border);
          padding-block: clamp(64px, 9vw, 120px);
        }
        .closing-inner {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .closing-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2.25rem, 6.5vw, 5rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
          margin: 0;
        }
        .closing-actions {
          margin-top: clamp(32px, 4vw, 48px);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 20px 28px;
        }
        .closing-cta-inner {
          width: min(420px, 100%);
        }

        /* ══ Footer ════════════════════════════════════════════════════ */
        .site-footer {
          background: var(--surface-island-deep);
          color: var(--text-primary);
          border-top: 1px solid var(--landing-border);
          padding-top: clamp(48px, 7vw, 84px);
          padding-bottom: clamp(28px, 4vw, 44px);
        }
        .footer-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(32px, 5vw, 48px);
        }
        .footer-wordmark {
          display: block;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2rem, 5vw, 3rem);
          letter-spacing: -0.05em;
          line-height: 0.9;
          color: var(--text-primary);
          margin-bottom: 18px;
        }
        .footer-desc {
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--ink-62);
          max-width: 42ch;
        }
        .footer-heading {
          font-family: var(--font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--ink-50);
          margin: 0 0 18px;
        }
        .footer-col ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .footer-col a {
          font-size: 0.9375rem;
          color: var(--ink-82);
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        .footer-col a:hover {
          color: var(--text-primary);
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .footer-static {
          font-size: 0.9375rem;
          color: var(--ink-62);
        }
        .footer-auth-pending {
          font-size: 0.9375rem;
          color: var(--ink-50);
        }
        .footer-creator-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .footer-creator-name {
          font-family: var(--font-body);
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
          line-height: 1.35;
        }
        .footer-creator-role {
          font-size: 0.8125rem;
          color: var(--ink-62);
          margin: 0 0 6px;
          line-height: 1.4;
        }
        .footer-github-link {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--ink-82);
          text-decoration: none;
          transition: color var(--transition-fast);
          width: fit-content;
          margin-bottom: 8px;
        }
        .footer-github-link:hover {
          color: var(--text-primary);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .footer-github-icon {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
          fill: currentColor;
        }
        .footer-creator-note {
          font-size: 0.75rem;
          color: var(--ink-50);
          line-height: 1.45;
          margin: 0;
        }
        .footer-base {
          margin-top: clamp(40px, 6vw, 68px);
          padding-top: 24px;
          border-top: 1px solid var(--landing-border);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .footer-base p {
          font-size: 0.8125rem;
          color: var(--ink-50);
          margin: 0;
        }
        .footer-legal {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 0.8125rem;
          color: var(--ink-50);
        }
        .footer-legal :global(a) {
          color: var(--ink-50);
          text-decoration: none;
          transition: color 0.15s ease;
        }
        .footer-legal :global(a:hover) {
          color: var(--text-primary);
        }

        @media (min-width: 640px) and (max-width: 1023px) {
          .footer-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 40px 36px;
          }
          .footer-brand {
            grid-column: span 2;
          }
        }

        @media (min-width: 1024px) {
          .footer-grid {
            grid-template-columns: 1.5fr 0.9fr 1.05fr 0.95fr 1.3fr;
            gap: clamp(24px, 3.2vw, 44px);
          }
        }

        /* ══ Theme preview ═════════════════════════════════════════════ */
        .themes {
          padding-block: clamp(64px, 9vw, 128px);
          background: var(--bg-surface);
          border-top: 1px solid var(--border-hairline);
          border-bottom: 1px solid var(--border-hairline);
        }
        .theme-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(28px, 4vw, 48px);
          align-items: start;
        }
        .theme-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .theme-item {
          display: flex;
          align-items: center;
          gap: 16px;
          width: 100%;
          text-align: left;
          padding: 14px 16px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          cursor: pointer;
          transition: border-color var(--transition-fast),
            background var(--transition-fast);
        }
        .theme-item:hover {
          border-color: var(--border-default);
          background: var(--bg-card-hover);
        }
        .theme-item.is-active {
          border-color: var(--accent-purple);
          background: var(--accent-purple-dim);
        }
        .theme-swatch {
          position: relative;
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          display: grid;
          place-items: center;
        }
        .theme-swatch-accent {
          width: 14px;
          height: 14px;
          border-radius: 50%;
        }
        .theme-item-text {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .theme-item-label {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1rem;
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }
        .theme-item-desc {
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .theme-preview {
          position: sticky;
          top: calc(var(--nav-h) + 24px);
        }
        .tp-doc {
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          padding: clamp(22px, 3vw, 32px);
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 320px;
          transition: background var(--transition-base),
            border-color var(--transition-base);
        }
        .tp-tag {
          font-family: var(--font-body);
          font-size: 0.625rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .tp-line {
          height: 8px;
          border-radius: 3px;
          width: 100%;
        }
        .tp-line--title {
          height: 14px;
          width: 58%;
        }
        .tp-line--short {
          width: 42%;
        }
        .tp-chart {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          height: clamp(70px, 12vw, 110px);
          margin-block: 6px;
        }
        .tp-chart span {
          flex: 1;
          border-radius: 3px 3px 0 0;
        }
        @media (min-width: 860px) {
          .theme-layout {
            grid-template-columns: 1fr 0.9fr;
          }
        }

        /* ══ FAQ + privacy ════════════════════════════════════════════ */
        .faq {
          padding-block: clamp(64px, 9vw, 128px);
        }
        .faq-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: clamp(32px, 5vw, 64px);
        }
        .faq-intro .section-title {
          margin-bottom: clamp(28px, 4vw, 40px);
        }
        .privacy-note {
          padding: 20px 22px;
          border: 1px solid var(--border-subtle);
          border-left: 2px solid var(--accent-purple);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
        }
        .privacy-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.0625rem;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          margin: 0 0 8px;
        }
        .privacy-body {
          font-size: 0.9375rem;
          line-height: 1.65;
          color: var(--text-secondary);
          margin: 0;
        }
        .faq-list {
          display: flex;
          flex-direction: column;
        }
        .faq-item {
          border-bottom: 1px solid var(--border-hairline);
        }
        .faq-item:first-child {
          border-top: 1px solid var(--border-hairline);
        }
        .faq-q {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 22px 0;
          cursor: pointer;
          list-style: none;
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(1.0625rem, 1.6vw, 1.25rem);
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }
        .faq-q::-webkit-details-marker {
          display: none;
        }
        .faq-caret {
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          border-right: 1.5px solid var(--text-secondary);
          border-bottom: 1.5px solid var(--text-secondary);
          transform: rotate(45deg);
          transition: transform var(--transition-fast);
        }
        .faq-item[open] .faq-caret {
          transform: rotate(-135deg);
        }
        .faq-a {
          margin: 0 0 22px;
          max-width: 60ch;
          font-size: 0.9375rem;
          line-height: 1.7;
          color: var(--text-secondary);
        }
        @media (min-width: 860px) {
          .faq-grid {
            grid-template-columns: 0.85fr 1.15fr;
          }
        }

        /* ══ Motion safety ═════════════════════════════════════════════ */
        [data-hero],
        [data-reveal] {
          will-change: opacity, transform;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-hero],
          [data-reveal],
          [data-echo] {
            opacity: 1 !important;
            transform: none !important;
            clip-path: none !important;
          }
          /* Echo stack offsets are set via top/left (see .echo--N), so they
             survive transform: none untouched. */
        }
      `}</style>
    </div>
  );
}

/** Format a converter RGB triple as an inline CSS color. */
function rgbToCss({ r, g, b }: { r: number; g: number; b: number }): string {
  return `rgb(${r} ${g} ${b})`;
}
