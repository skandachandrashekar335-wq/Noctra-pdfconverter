"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { UploadZone } from "@/components/UploadZone";
import { ConversionList } from "@/components/ConversionList";
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
  const { user, profile, signOut } = useAuth();

  return (
    <div className="dash-shell">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="dash-sidebar">
        <Link href="/" className="dash-logo" aria-label="Noctra home">
          <NoctraLogo />
        </Link>

        <nav className="dash-nav" aria-label="Dashboard navigation">
          <NavItem icon={<UploadNavIcon />} label="Convert" active />
          <NavItem icon={<HistoryNavIcon />} label="History" />
        </nav>

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
            onClick={signOut}
            className="dash-signout"
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOutIcon />
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="dash-main">
        <div className="dash-main-inner">
          {/* Header */}
          <header className="dash-header">
            <div>
              <h1 className="dash-title">Convert Document</h1>
              <p className="dash-sub">
                Upload a PDF or PPTX to get a comfortable dark-mode version.
              </p>
            </div>
          </header>

          {/* Upload */}
          <section aria-label="Upload document">
            <UploadZone />
          </section>

          {/* Conversion history */}
          <section className="dash-history-section" aria-label="Recent conversions">
            <h2 className="dash-section-title">Recent conversions</h2>
            <ConversionList />
          </section>
        </div>
      </main>

      <style jsx>{`
        .dash-shell {
          display: flex;
          min-height: 100vh;
          background: var(--bg-base);
        }

        /* Sidebar */
        .dash-sidebar {
          width: 260px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-subtle);
          padding: 28px 16px;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }
        .dash-logo {
          display: flex;
          align-items: center;
          text-decoration: none;
          padding: 0 8px;
          margin-bottom: 32px;
        }

        /* Nav */
        .dash-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        /* Profile */
        .dash-profile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 8px;
          border-top: 1px solid var(--border-subtle);
          margin-top: auto;
        }
        :global(.dash-avatar) {
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dash-profile-info { flex: 1; min-width: 0; }
        .dash-profile-name {
          font-size: 0.875rem;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dash-profile-email {
          font-size: 0.75rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dash-signout {
          flex-shrink: 0;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 6px;
          border-radius: 8px;
          transition: background 150ms, color 150ms;
        }
        .dash-signout:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
        }

        /* Main */
        .dash-main {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
        }
        .dash-main-inner {
          max-width: 820px;
          margin: 0 auto;
          padding: 48px 32px;
          display: flex;
          flex-direction: column;
          gap: 40px;
        }
        .dash-header {}
        .dash-title {
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: -0.02em;
        }
        .dash-sub {
          color: var(--text-secondary);
          margin-top: 6px;
        }
        .dash-history-section {}
        .dash-section-title {
          font-size: 1.0625rem;
          font-weight: 600;
          margin-bottom: 16px;
        }

        /* Mobile: collapse sidebar */
        @media (max-width: 768px) {
          .dash-shell { flex-direction: column; }
          .dash-sidebar {
            width: 100%;
            height: auto;
            position: static;
            flex-direction: row;
            align-items: center;
            padding: 14px 20px;
            border-right: none;
            border-bottom: 1px solid var(--border-subtle);
          }
          .dash-logo { margin-bottom: 0; margin-right: auto; }
          .dash-nav { flex-direction: row; flex: 0 0 auto; }
          .dash-profile { border-top: none; margin-top: 0; padding: 0; }
          .dash-profile-info { display: none; }
          .dash-main-inner { padding: 24px 16px; }
        }
      `}</style>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className="nav-icon" aria-hidden="true">{icon}</span>
      {label}
      <style jsx>{`
        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 10px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 150ms, color 150ms;
          width: 100%;
          text-align: left;
        }
        .nav-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
        .nav-item.active { background: var(--accent-purple-dim); color: var(--accent-purple); }
        .nav-icon { flex-shrink: 0; }
      `}</style>
    </button>
  );
}

function AvatarFallback({ name }: { name?: string | null }) {
  const initials = name
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
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="url(#logo-grad)" />
        <path d="M8 24L16 8L24 24" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.5 19H21.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7C6DFF" />
            <stop offset="1" stopColor="#4F8FFF" />
          </linearGradient>
        </defs>
      </svg>
      <span style={{ fontWeight: 700, fontSize: "1.0625rem", letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
        Noctra
      </span>
    </span>
  );
}

function UploadNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function HistoryNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
