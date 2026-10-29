"use client";

import { useCallback, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { UploadZone } from "@/components/UploadZone";
import { ConversionList } from "@/components/ConversionList";
import { BatchUploadZone } from "@/components/BatchUploadZone";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user, profile, signOut, error, clearError, configError } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  // Bumped whenever a conversion settles so the history list refetches.
  // The list may still be mid-write at that instant, hence the short delay.
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleConversionSettled = useCallback(() => {
    window.setTimeout(() => setHistoryRefresh((n) => n + 1), 400);
  }, []);

  async function handleSignOut() {
    clearError();
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // signOut surfaced the message into context state; the AuthGuard will
      // redirect to the landing page once onAuthStateChanged fires null.
    } finally {
      setSigningOut(false);
    }
  }

  const shownError = configError ?? error;

  return (
    <div className="dash-shell theme-dark">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="dash-sidebar">
        <Link href="/" className="dash-logo" aria-label="Noctra home">
          <NoctraLogo />
        </Link>

        <nav className="dash-nav" aria-label="Dashboard navigation">
          <NavItem icon={<UploadNavIcon />} label="Convert" active />
          <NavItem icon={<HistoryNavIcon />} label="History" href="#history" />
        </nav>

        <div className="dash-theme">
          <span className="dash-theme-caption">Appearance</span>
          <ThemeToggle />
        </div>

        <div className="dash-profile">
          {user?.photoURL ? (
            <Image
              src={user.photoURL}
              alt={profile?.displayName ?? "User avatar"}
              width={36}
              height={36}
              className="dash-avatar"
            />
          ) : (
            <AvatarFallback name={profile?.displayName} />
          )}
          <div className="dash-profile-info">
            <p className="dash-profile-name">
              {profile?.displayName ?? "User"}
            </p>
            <p className="dash-profile-email">{profile?.email}</p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="dash-signout"
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOutIcon />
          </button>
        </div>
        {shownError && (
          <p role="alert" className="dash-auth-error">
            {shownError}
          </p>
        )}
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="dash-main">
        <div className="dash-main-inner">
          {/* Header */}
          <header className="dash-header">
            <p className="dash-eyebrow">Workspace</p>
            <h1 className="dash-title">Convert Document</h1>
            <p className="dash-sub">
               Upload a PDF, DOCX or PPTX to get a comfortable dark-mode version.
            </p>
          </header>

          {/* Upload */}
          <section aria-label="Upload document">
            <UploadZone onConversionSettled={handleConversionSettled} />
            <BatchUploadZone />
          </section>

          {/* Conversion history */}
          <section
            className="dash-history-section"
            id="history"
            aria-label="Recent conversions"
          >
            <div className="dash-section-head">
              <h2 className="dash-section-title">Recent conversions</h2>
              <span className="dash-section-rule" aria-hidden="true" />
            </div>
            {/* Keyed by uid: switching accounts remounts the list, so the
                previous user's rows can never flash into the new session. */}
            <ConversionList
              key={user?.uid ?? "anon"}
              refreshToken={historyRefresh}
            />
          </section>
        </div>
      </main>

      <style jsx>{`
        .dash-shell {
          display: flex;
          min-height: 100vh;
          background: var(--bg-base);
          color: var(--text-primary);
        }

        /* ── Sidebar ── */
        .dash-sidebar {
          width: 248px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-hairline);
          padding: 28px 20px;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }
        .dash-logo {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          padding-bottom: 24px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--border-hairline);
        }

        /* ── Nav ── */
        .dash-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }

        /* ── Profile ── */
        .dash-profile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 18px 0 0;
          border-top: 1px solid var(--border-hairline);
          margin-top: auto;
        }
        :global(.dash-avatar) {
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dash-profile-info {
          flex: 1;
          min-width: 0;
        }
        .dash-profile-name {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dash-profile-email {
          font-size: 0.6875rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }
        .dash-signout {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: none;
          border: 1px solid transparent;
          border-radius: var(--radius-pill);
          color: var(--text-muted);
          cursor: pointer;
          transition: color var(--transition-fast),
            border-color var(--transition-fast),
            background var(--transition-fast);
        }
        .dash-signout:hover {
          background: var(--bg-elevated);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        .dash-signout:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .dash-auth-error {
          margin-top: 10px;
          font-size: 0.75rem;
          line-height: 1.5;
          color: var(--accent-bad);
        }

        /* ── Main ── */
        .dash-main {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
        }
        .dash-main-inner {
          max-width: 880px;
          margin: 0 auto;
          padding: clamp(32px, 5vw, 64px) clamp(20px, 4vw, 40px);
          display: flex;
          flex-direction: column;
          gap: clamp(36px, 5vw, 56px);
        }

        /* ── Header ── */
        .dash-eyebrow {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 14px;
        }
        .dash-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(2.25rem, 6vw, 4.25rem);
          line-height: 0.9;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: var(--text-primary);
        }
        .dash-sub {
          margin-top: 16px;
          max-width: 46ch;
          font-size: 0.9375rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        /* ── History section ── */
        .dash-section-head {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }
        .dash-section-title {
          font-family: var(--font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .dash-section-rule {
          flex: 1;
          height: 1px;
          background: var(--border-hairline);
        }

        /* ── Mobile: collapse sidebar ── */
        @media (max-width: 768px) {
          .dash-shell {
            flex-direction: column;
          }
          .dash-sidebar {
            width: 100%;
            height: auto;
            position: static;
            flex-direction: row;
            align-items: center;
            padding: 12px 20px;
            border-right: none;
            border-bottom: 1px solid var(--border-hairline);
          }
          .dash-logo {
            padding-bottom: 0;
            margin-bottom: 0;
            margin-right: auto;
            border-bottom: none;
          }
          .dash-nav {
            flex-direction: row;
            flex: 0 0 auto;
            margin-right: 8px;
          }
          .dash-profile {
            border-top: none;
            margin-top: 0;
            padding: 0;
          }
          .dash-profile-info {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-label">{label}</span>
    </>
  );

  // The current page is a non-interactive marker; anything with an href is a
  // real link so navigation never dead-ends in a do-nothing button.
  if (href) {
    return (
      <a
        href={href}
        className="nav-item"
        onClick={(e) => {
          // Same-page anchor: scroll smoothly without a full navigation.
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
              block: "start",
            });
          }
        }}
      >
        {inner}
        <style jsx>{`
          .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 11px 12px;
            border: none;
            border-left: 2px solid transparent;
            border-radius: 0;
            background: transparent;
            color: var(--text-muted);
            font-family: var(--font-body);
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
            text-align: left;
            text-decoration: none;
            cursor: pointer;
            transition: color var(--transition-fast),
              background var(--transition-fast),
              border-color var(--transition-fast);
          }
          .nav-item:hover {
            background: var(--bg-elevated);
            color: var(--text-primary);
          }
          .nav-icon {
            flex-shrink: 0;
            display: inline-flex;
          }
          .nav-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        `}</style>
      </a>
    );
  }

  return (
    <span
      className={`nav-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {inner}
      <style jsx>{`
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 11px 12px;
          border: none;
          border-left: 2px solid transparent;
          border-radius: 0;
          background: transparent;
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          text-align: left;
          cursor: pointer;
          transition: color var(--transition-fast),
            background var(--transition-fast),
            border-color var(--transition-fast);
        }
        .nav-item.active {
          border-left-color: var(--accent-purple);
          color: var(--text-primary);
          background: var(--accent-purple-dim);
        }
        .nav-icon {
          flex-shrink: 0;
          display: inline-flex;
        }
        .nav-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </span>
  );
}

function AvatarFallback({ name }: { name?: string | null }) {
  const initials =
    name
      ?.split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  return (
    <div
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--accent-purple-dim)",
        border: "1px solid var(--border-default)",
        color: "var(--accent-purple)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.75rem",
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────

function NoctraLogo() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Image
        src="/noctra-logo.png"
        alt=""
        width={30}
        height={30}
        style={{ borderRadius: 8, objectFit: "cover" }}
        priority
      />
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "1.0625rem",
          letterSpacing: "-0.05em",
          textTransform: "uppercase",
          color: "var(--text-primary)",
        }}
      >
        Noctra
      </span>
    </span>
  );
}

function UploadNavIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function HistoryNavIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
