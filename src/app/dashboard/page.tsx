"use client";

import { useCallback, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { UploadZone } from "@/components/UploadZone";
import { ConversionList } from "@/components/ConversionList";
import { BatchUploadZone } from "@/components/BatchUploadZone";
import { StudyStudio } from "@/components/StudyStudio";
import { ThemeToggle } from "@/components/ThemeToggle";
import { OnboardingModal } from "@/components/OnboardingModal";
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
  const { user, profile, signOut, deleteAccount, error, clearError, configError } = useAuth();
  const [activeTab, setActiveTab] = useState<"convert" | "library" | "study" | "settings">("convert");
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (err) {
      console.error("Account deletion failed:", err);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  const shownError = configError ?? error;

  return (
    <div className="dash-shell theme-dark">
      <OnboardingModal />

      {/* ── Delete Account Confirmation Modal ────────────────────── */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-[#0f1115] border border-red-900/50 rounded-2xl p-6 shadow-2xl">
            <h3 id="delete-modal-title" className="text-lg font-bold text-red-400 mb-2">
              Delete Account &amp; Stored Data
            </h3>
            <p className="text-sm text-zinc-300 mb-4 leading-relaxed">
              Are you sure you want to permanently delete your account? This will erase all your conversion history, document tags, favorites, and reader bookmarks. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="dash-sidebar">
        <Link href="/" className="dash-logo" aria-label="Noctra home">
          <NoctraLogo />
        </Link>

        <nav className="dash-nav" aria-label="Dashboard navigation">
          <NavItem
            icon={<UploadNavIcon />}
            label="Convert"
            active={activeTab === "convert"}
            onClick={() => setActiveTab("convert")}
          />
          <NavItem
            icon={<HistoryNavIcon />}
            label="Library"
            active={activeTab === "library"}
            onClick={() => setActiveTab("library")}
          />
          <NavItem
            icon={<StudyNavIcon />}
            label="Study AI"
            active={activeTab === "study"}
            onClick={() => setActiveTab("study")}
          />
          <NavItem
            icon={<SettingsNavIcon />}
            label="Settings"
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          />
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
            <button
              onClick={() => setShowDeleteModal(true)}
              className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors mt-0.5 cursor-pointer block"
            >
              Delete account
            </button>
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

        <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300 transition-colors">
            Privacy
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-zinc-300 transition-colors">
            Terms
          </Link>
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
          {activeTab === "convert" && (
            <>
              <header className="dash-header">
                <p className="dash-eyebrow">Workspace</p>
                <h1 className="dash-title">Convert Document</h1>
                <p className="dash-sub">
                  Upload a PDF, DOCX or PPTX to get a comfortable dark-mode version.
                </p>
              </header>

              <section aria-label="Upload document">
                <UploadZone onConversionSettled={handleConversionSettled} />
                <BatchUploadZone />
              </section>

              <section
                className="dash-history-section"
                id="history"
                aria-label="Recent conversions"
              >
                <div className="dash-section-head">
                  <h2 className="dash-section-title">Recent conversions</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab("library")}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors cursor-pointer"
                  >
                    View All in Library →
                  </button>
                  <span className="dash-section-rule" aria-hidden="true" />
                </div>
                <ConversionList
                  key={user?.uid ?? "anon"}
                  refreshToken={historyRefresh}
                />
              </section>
            </>
          )}

          {activeTab === "library" && (
            <>
              <header className="dash-header">
                <p className="dash-eyebrow">Smart Document Library</p>
                <h1 className="dash-title">Your Converted Documents</h1>
                <p className="dash-sub">
                  Search, filter, tag, favorite, and open your dark-mode study documents directly in the reader.
                </p>
              </header>

              <section aria-label="Document library">
                <ConversionList
                  key={user?.uid ?? "anon"}
                  refreshToken={historyRefresh}
                />
              </section>
            </>
          )}

          {activeTab === "study" && (
            <>
              <header className="dash-header">
                <p className="dash-eyebrow">AI Study Assistant</p>
                <h1 className="dash-title">Noctra Study Studio</h1>
                <p className="dash-sub">
                  Generate executive summaries, extract key concepts, practice tests, and revision plans from your study materials with Gemini.
                </p>
              </header>

              <section aria-label="Study Studio">
                <StudyStudio />
              </section>
            </>
          )}

          {activeTab === "settings" && (
            <>
              <header className="dash-header">
                <p className="dash-eyebrow">Preferences &amp; Privacy</p>
                <h1 className="dash-title">Workspace Settings</h1>
                <p className="dash-sub">
                  Manage application appearance, offline data isolation, and account preferences.
                </p>
              </header>

              <section className="grid gap-6 max-w-2xl" aria-label="Settings options">
                <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider mb-2">
                    Interface Theme
                  </h3>
                  <p className="text-xs text-zinc-400 mb-4">
                    Choose how Noctra looks across your devices. System mode matches your OS preference automatically.
                  </p>
                  <ThemeToggle />
                </div>

                <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider mb-2">
                    Security &amp; Document Privacy
                  </h3>
                  <div className="space-y-3 text-xs text-zinc-300 leading-relaxed">
                    <p>
                      <strong>Zero-Server Document Processing:</strong> In local-first mode, all PDF, DOCX, and PPTX conversions are performed in your browser&apos;s Web Worker memory. Your original document contents never leave your device unless you explicitly opt into the AI Study Assistant.
                    </p>
                    <p>
                      <strong>100% User Ownership:</strong> You retain complete, unrestricted copyright and ownership over all uploaded, converted, and exported documents.
                    </p>
                    <div className="flex gap-4 pt-2">
                      <Link href="/privacy" className="text-indigo-400 hover:underline">
                        Read Privacy Policy
                      </Link>
                      <Link href="/terms" className="text-indigo-400 hover:underline">
                        Read Terms of Service
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-zinc-900/60 border border-red-900/30">
                  <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-2">
                    Danger Zone
                  </h3>
                  <p className="text-xs text-zinc-400 mb-4">
                    Permanently delete your account and all associated conversion records, reader annotations, and tags.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 text-xs font-semibold text-white bg-red-600/90 hover:bg-red-600 rounded-lg transition-colors cursor-pointer"
                  >
                    Delete My Account &amp; Data
                  </button>
                </div>
              </section>
            </>
          )}
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
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-label">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`nav-item ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </button>
    );
  }

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

function StudyNavIcon() {
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
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function SettingsNavIcon() {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
