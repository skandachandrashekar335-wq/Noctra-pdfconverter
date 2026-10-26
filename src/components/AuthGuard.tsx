"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps a page that requires authentication.
 * Shows a loading spinner while Firebase resolves auth state,
 * then redirects unauthenticated users to the landing page.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, configError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user && !configError) {
      router.replace("/");
    }
  }, [loading, user, configError, router]);

  // Missing env vars: explain rather than redirect-loop or spin forever.
  if (configError) {
    return (
      <div className="auth-guard-loading" role="alert">
        <p className="auth-loading-label">Configuration required</p>
        <p className="auth-config-error">{configError}</p>
        <style jsx>{`
          .auth-guard-loading {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 16px;
            padding: 24px;
            text-align: center;
            background: var(--bg-base);
          }
          .auth-loading-label {
            font-family: var(--font-body);
            font-size: 0.6875rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: var(--text-muted);
          }
          .auth-config-error {
            max-width: 52ch;
            font-size: 0.875rem;
            line-height: 1.6;
            color: var(--accent-bad);
          }
        `}</style>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="auth-guard-loading"
        role="status"
        aria-label="Loading your workspace"
      >
        <div className="auth-spinner" aria-hidden="true" />
        <p className="auth-loading-label">Loading workspace</p>
        <style jsx>{`
          .auth-guard-loading {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 20px;
            background: var(--bg-base);
          }
          .auth-spinner {
            width: 28px;
            height: 28px;
            border: 1px solid var(--border-strong);
            border-top-color: var(--accent-purple);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          .auth-loading-label {
            font-family: var(--font-body);
            font-size: 0.6875rem;
            font-weight: 700;
            letter-spacing: 0.22em;
            text-transform: uppercase;
            color: var(--text-muted);
          }
          @keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    // Will redirect via useEffect; render nothing in the meantime
    return null;
  }

  return <>{children}</>;
}
