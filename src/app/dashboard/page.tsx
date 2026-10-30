"use client";

import { useCallback, useState } from "react";
import { AuthGuard } from "@/components/AuthGuard";
import { UploadZone } from "@/components/UploadZone";
import { ConversionList } from "@/components/ConversionList";
import { BatchUploadZone } from "@/components/BatchUploadZone";
import { StudyStudio } from "@/components/StudyStudio";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useOfflineStatus } from "@/components/ServiceWorkerRegister";
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
  const isOffline = useOfflineStatus();
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

        <div className="dash-status-block" role="status" aria-live="polite">
          <span className="dash-theme-caption">Engine Status</span>
          <div className={`dash-status-pill ${isOffline ? "is-offline" : "is-online"}`}>
            <span className="dash-status-dot" aria-hidden="true" />
            <div className="dash-status-info">
              <span className="dash-status-title">
                {isOffline ? "Working Offline" : "Local Engine Active"}
              </span>
              <span className="dash-status-desc">
                {isOffline ? "Local conversion & reader ready" : "Zero document uploads"}
              </span>
            </div>
          </div>
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
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="dash-delete-link"
            >
              Delete account
            </button>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="dash-signout"
            aria-label="Sign out"
            title="Sign out"
          >
            <SignOutIcon />
          </button>
        </div>

        <div className="dash-sidebar-footer">
          <Link href="/privacy" className="dash-footer-link">
            Privacy
          </Link>
          <span className="dash-footer-dot">•</span>
          <Link href="/terms" className="dash-footer-link">
            Terms
          </Link>
        </div>

        {shownError && (
          <p role="alert" className="dash-auth-error">
            {shownError}
          </p>
        )}
      </aside>

      {/* ── Mobile Tab Navigation (Fixed bottom bar on small viewports) ── */}
      <nav className="dash-mobile-nav" aria-label="Mobile navigation">
        <button
          type="button"
          className={`dash-mobile-tab ${activeTab === "convert" ? "is-active" : ""}`}
          onClick={() => setActiveTab("convert")}
        >
          <UploadNavIcon />
          <span>Convert</span>
        </button>
        <button
          type="button"
          className={`dash-mobile-tab ${activeTab === "library" ? "is-active" : ""}`}
          onClick={() => setActiveTab("library")}
        >
          <HistoryNavIcon />
          <span>Library</span>
        </button>
        <button
          type="button"
          className={`dash-mobile-tab ${activeTab === "study" ? "is-active" : ""}`}
          onClick={() => setActiveTab("study")}
        >
          <StudyNavIcon />
          <span>Study AI</span>
        </button>
        <button
          type="button"
          className={`dash-mobile-tab ${activeTab === "settings" ? "is-active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <SettingsNavIcon />
          <span>Settings</span>
        </button>
      </nav>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="dash-main">
        <div className="dash-main-inner">
          {isOffline && (
            <div className="dash-mobile-offline-banner" role="status" aria-live="polite">
              <span className="dash-status-dot is-offline-dot" aria-hidden="true" />
              <span>Working Offline · Local document conversion and reader ready</span>
            </div>
          )}
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

              <section className="grid gap-6 max-w-3xl" aria-label="Settings options">
                <div className="p-6 sm:p-7 rounded-2xl bg-[#0f1115] border border-zinc-800/80">
                  <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-2">
                    Interface Theme
                  </h3>
                  <p className="text-xs text-zinc-400 mb-5 leading-relaxed max-w-xl">
                    Choose how Noctra looks across your devices. System mode matches your OS preference automatically.
                  </p>
                  <div className="settings-theme-wrapper">
                    <ThemeToggle />
                  </div>
                </div>

                <div className="p-6 sm:p-7 rounded-2xl bg-[#0f1115] border border-zinc-800/80">
                  <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-2">
                    Security &amp; Document Privacy
                  </h3>
                  <div className="space-y-4 text-xs text-zinc-300 leading-relaxed max-w-2xl">
                    <p>
                      <strong className="text-zinc-100 font-semibold">Zero-Server Document Processing:</strong> In local-first mode, all PDF, DOCX, and PPTX conversions are performed in your browser&apos;s Web Worker memory. Your original document contents never leave your device unless you explicitly opt into the AI Study Assistant.
                    </p>
                    <p>
                      <strong className="text-zinc-100 font-semibold">100% User Ownership:</strong> You retain complete, unrestricted copyright and ownership over all uploaded, converted, and exported documents.
                    </p>
                    <div className="flex items-center gap-6 pt-2 text-xs">
                      <Link href="/privacy" className="text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1 font-medium">
                        Read Privacy Policy <span>→</span>
                      </Link>
                      <Link href="/terms" className="text-purple-400 hover:text-purple-300 transition-colors inline-flex items-center gap-1 font-medium">
                        Read Terms of Service <span>→</span>
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="p-6 sm:p-7 rounded-2xl bg-[#140b0d] border border-red-900/40">
                  <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">
                    Danger Zone
                  </h3>
                  <p className="text-xs text-zinc-400 mb-5 leading-relaxed max-w-xl">
                    Permanently delete your account and all associated conversion records, reader annotations, and tags. This action cannot be reversed.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(true)}
                    className="px-5 py-2.5 text-xs font-semibold text-red-200 hover:text-white bg-red-950/60 hover:bg-red-900/80 border border-red-800/60 hover:border-red-600 rounded-xl transition-all shadow-sm cursor-pointer inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
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
          position: relative;
        }

        /* ── Sidebar ── */
        .dash-sidebar {
          width: 256px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-hairline);
          padding: 24px 18px;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          background: var(--bg-base);
          z-index: 30;
        }

        /* ── Logo ── */
        .dash-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
          padding-bottom: 20px;
          margin-bottom: 18px;
          border-bottom: 1px solid var(--border-hairline);
        }

        /* ── Navigation ── */
        .dash-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        /* ── Engine Status Block ── */
        .dash-status-block {
          margin: 14px 0 6px;
        }
        .dash-status-pill {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          transition: border-color var(--transition-fast), background var(--transition-fast);
        }
        .dash-status-pill.is-offline {
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.08);
        }
        .dash-status-pill.is-online {
          border-color: var(--border-subtle);
          background: var(--bg-inset);
        }
        .dash-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dash-status-pill.is-offline .dash-status-dot {
          background: #f59e0b;
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
        }
        .dash-status-pill.is-online .dash-status-dot {
          background: #34d399;
        }
        .dash-status-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .dash-status-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .dash-status-pill.is-offline .dash-status-title {
          color: #fbbf24;
        }
        .dash-status-desc {
          font-size: 0.625rem;
          color: var(--text-muted);
          line-height: 1.2;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dash-mobile-offline-banner {
          display: none;
        }

        /* ── Profile ── */
        .dash-profile {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 0 0;
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
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
        }
        .dash-profile-email {
          font-size: 0.6875rem;
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
          line-height: 1.2;
        }
        .dash-delete-link {
          display: block;
          margin-top: 3px;
          background: none;
          border: none;
          padding: 0;
          font-size: 0.625rem;
          color: var(--text-muted);
          cursor: pointer;
          transition: color var(--transition-fast);
        }
        .dash-delete-link:hover {
          color: var(--accent-bad);
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

        /* ── Sidebar Footer ── */
        .dash-sidebar-footer {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.6875rem;
          color: var(--text-muted);
        }
        :global(.dash-footer-link) {
          color: var(--text-muted);
          text-decoration: none;
          transition: color var(--transition-fast);
        }
        :global(.dash-footer-link:hover) {
          color: var(--text-secondary);
        }
        .dash-footer-dot {
          opacity: 0.4;
        }
        .dash-auth-error {
          margin-top: 10px;
          font-size: 0.75rem;
          line-height: 1.5;
          color: var(--accent-bad);
        }

        /* ── Mobile Navigation ── */
        .dash-mobile-nav {
          display: none;
        }

        /* ── Main Workspace ── */
        .dash-main {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
        }
        .dash-main-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: clamp(28px, 4vw, 56px) clamp(20px, 4vw, 48px);
          display: flex;
          flex-direction: column;
          gap: clamp(32px, 4vw, 48px);
        }

        /* ── Header ── */
        .dash-eyebrow {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 10px;
        }
        .dash-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: clamp(1.75rem, 3.5vw, 2.75rem);
          line-height: 1.15;
          letter-spacing: -0.015em;
          word-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-primary);
        }
        .dash-sub {
          margin-top: 12px;
          max-width: 60ch;
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
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .dash-section-rule {
          flex: 1;
          height: 1px;
          background: var(--border-hairline);
        }

        /* ── Navigation Items (Standardized across button / a / span) ── */
        :global(.nav-item) {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 42px;
          padding: 9px 12px;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          background: transparent;
          color: var(--text-secondary);
          font-family: var(--font-body);
          font-size: 0.8125rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
          position: relative;
          transition: color var(--transition-fast), background var(--transition-fast), border-color var(--transition-fast);
        }
        :global(.nav-item:hover) {
          background: var(--bg-elevated);
          color: var(--text-primary);
          border-color: var(--border-subtle);
        }
        :global(.nav-item.is-active) {
          background: var(--accent-purple-dim);
          border-color: rgba(124, 109, 255, 0.35);
          color: var(--text-primary);
          font-weight: 700;
        }
        :global(.nav-item .nav-icon) {
          width: 20px;
          height: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: currentColor;
        }
        :global(.nav-item .nav-label) {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1;
        }
        :global(.nav-item.is-active .nav-active-pill) {
          width: 4px;
          height: 14px;
          border-radius: var(--radius-pill);
          background: var(--accent-purple);
          margin-left: auto;
          flex-shrink: 0;
        }

        /* ── Responsive Mobile & Tablet Shell ── */
        @media (max-width: 768px) {
          .dash-shell {
            flex-direction: column;
            padding-bottom: 72px; /* space for fixed mobile bottom nav */
          }
          .dash-sidebar {
            width: 100%;
            height: auto;
            position: sticky;
            top: 0;
            z-index: 40;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding: 10px 16px;
            border-right: none;
            border-bottom: 1px solid var(--border-hairline);
            background: var(--bg-base);
          }
          .dash-logo {
            padding-bottom: 0;
            margin-bottom: 0;
            border-bottom: none;
          }
          .dash-nav {
            display: none;
          }
          .dash-theme {
            margin: 0;
            padding: 0;
            border: none;
          }
          .dash-status-block {
            display: none;
          }
          .dash-mobile-offline-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 9px 12px;
            margin-bottom: 16px;
            border-radius: var(--radius-md);
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.35);
            color: #fbbf24;
            font-size: 0.75rem;
            font-weight: 500;
          }
          .dash-mobile-offline-banner .is-offline-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #f59e0b;
            flex-shrink: 0;
            box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
          }
          .dash-profile {
            border-top: none;
            margin-top: 0;
            padding: 0;
            gap: 8px;
          }
          .dash-profile-info {
            display: none;
          }
          .dash-sidebar-footer {
            display: none;
          }

          /* Mobile bottom tab bar */
          .dash-mobile-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100vw;
            max-width: 100%;
            z-index: 50;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            background: var(--bg-surface);
            border-top: 1px solid var(--border-hairline);
            padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.4);
            box-sizing: border-box;
          }
          :global(.dash-mobile-tab) {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 6px 2px;
            border-radius: var(--radius-md);
            background: transparent;
            border: none;
            color: var(--text-muted);
            font-size: 0.6875rem;
            font-weight: 600;
            cursor: pointer;
            transition: color var(--transition-fast), background var(--transition-fast);
          }
          :global(.dash-mobile-tab.is-active) {
            color: var(--text-primary);
            background: var(--accent-purple-dim);
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
  const content = (
    <>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-label">{label}</span>
      {active && <span className="nav-active-pill" aria-hidden="true" />}
    </>
  );

  const className = `nav-item ${active ? "is-active" : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={className}
        aria-current={active ? "page" : undefined}
      >
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        className={className}
        onClick={(e) => {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "auto"
                : "smooth",
              block: "start",
            });
          }
        }}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={className} aria-current={active ? "page" : undefined}>
      {content}
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
          fontSize: "1.125rem",
          letterSpacing: "-0.02em",
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
