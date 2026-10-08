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
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="auth-guard-loading" role="status" aria-label="Loading">
        <div className="auth-spinner" aria-hidden="true" />
        <style jsx>{`
          .auth-guard-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-base);
          }
          .auth-spinner {
            width: 36px;
            height: 36px;
            border: 3px solid var(--border-default);
            border-top-color: var(--accent-purple);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
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
