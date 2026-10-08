"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

interface GoogleSignInButtonProps {
  label?: string;
  className?: string;
}

export function GoogleSignInButton({
  label = "Continue with Google",
  className = "",
}: GoogleSignInButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Sign-in failed. Please try again.";
      // Ignore user-cancelled popup
      if (!msg.includes("popup-closed") && !msg.includes("cancelled")) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        onClick={handleClick}
        disabled={loading}
        className="google-signin-btn"
        aria-label="Sign in with Google"
      >
        {loading ? (
          <span className="signin-spinner" aria-hidden="true" />
        ) : (
          <GoogleIcon />
        )}
        <span>{loading ? "Signing in…" : label}</span>
      </button>
      {error && (
        <p role="alert" className="signin-error">
          {error}
        </p>
      )}
      <style jsx>{`
        .google-signin-btn {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 13px 28px;
          width: 100%;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          color: var(--text-primary);
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 200ms ease, border-color 200ms ease,
            transform 150ms ease;
        }
        .google-signin-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }
        .google-signin-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .google-signin-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .signin-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.2);
          border-top-color: var(--accent-purple);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .signin-error {
          margin-top: 8px;
          font-size: 0.8125rem;
          color: #f87171;
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
