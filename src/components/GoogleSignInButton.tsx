"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

type GoogleSignInButtonVariant =
  | "default"
  | "compact"
  | "nav"
  | "footer"
  | "invert";

interface GoogleSignInButtonProps {
  label?: string;
  className?: string;
  variant?: GoogleSignInButtonVariant;
  /** Hide the local copy when the page renders one shared live region. */
  showError?: boolean;
  /** Used by the mobile menu to close before opening the popup. */
  onStart?: () => void;
  /** Called after Firebase accepts the popup credentials. */
  onSuccess?: () => void;
}

export function GoogleSignInButton({
  label = "Continue with Google",
  className = "",
  variant = "default",
  showError = true,
  onStart,
  onSuccess,
}: GoogleSignInButtonProps) {
  const {
    signInWithGoogle,
    signingIn,
    error,
    clearError,
    configError,
  } = useAuth();
  const [loading, setLoading] = useState(false);

  // The error surfaces from the auth context (classified by
  // lib/auth-errors). `configError` covers missing env vars.
  const shownError = configError ?? error;
  const busy = loading || signingIn;

  async function handleClick() {
    if (busy) return;
    clearError();
    onStart?.();
    setLoading(true);
    try {
      const started = await signInWithGoogle();
      if (started) onSuccess?.();
    } catch {
      // signInWithGoogle classified the error into context state.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || Boolean(configError)}
        aria-busy={busy}
        className={`google-signin-btn google-signin-btn--${variant}`}
      >
        {busy ? (
          <span className="signin-spinner" aria-hidden="true" />
        ) : (
          <GoogleIcon />
        )}
        <span>
          {busy ? "Signing in…" : label}
        </span>
      </button>
      {showError && shownError && (
        <p role="alert" className="signin-error">
          {shownError}
        </p>
      )}
      <style jsx>{`
        /* Editorial pill: solid ink on the light landing scope, inverted on
           dark islands. Reads only semantic tokens, so it works in both. */
        .google-signin-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 52px;
          width: 100%;
          padding: 14px 30px;
          background: var(--text-primary);
          color: var(--bg-base);
          border: 1px solid var(--text-primary);
          border-radius: var(--radius-pill);
          font-family: var(--font-body);
          font-size: 0.8125rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background var(--transition-fast),
            color var(--transition-fast), border-color var(--transition-fast),
            transform var(--transition-fast);
        }
        .google-signin-btn:hover:not(:disabled) {
          background: transparent;
          color: var(--text-primary);
          transform: translateY(-1px);
        }
        .google-signin-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .google-signin-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
        }
        .google-signin-btn--compact {
          width: auto;
          min-height: 44px;
          padding-inline: 22px;
          background: transparent;
          color: var(--text-primary);
          border-color: var(--text-primary);
          font-size: 0.75rem;
          letter-spacing: 0.14em;
        }
        .google-signin-btn--compact:hover:not(:disabled) {
          background: var(--text-primary);
          color: var(--bg-base);
        }
        .google-signin-btn--nav {
          min-height: 0;
          justify-content: flex-start;
          padding: 16px 0;
          border: 0;
          border-bottom: 1px solid var(--border-hairline);
          border-radius: 0;
          background: transparent;
          color: var(--text-primary);
          font-size: 0.8125rem;
          letter-spacing: 0.16em;
          text-align: left;
        }
        .google-signin-btn--nav:hover:not(:disabled) {
          background: transparent;
          color: var(--accent-purple);
          transform: none;
        }
        .google-signin-btn--footer {
          width: auto;
          min-height: 0;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          color: rgba(242, 242, 242, 0.82);
          font-size: 0.9375rem;
          font-weight: 400;
          letter-spacing: normal;
          text-transform: none;
          justify-content: flex-start;
        }
        .google-signin-btn--footer:hover:not(:disabled) {
          background: transparent;
          color: #f2f2f2;
          text-decoration: underline;
          text-underline-offset: 4px;
          transform: none;
        }
        .google-signin-btn--invert {
          background: transparent;
          color: #f2f2f2;
          border-color: #f2f2f2;
        }
        .google-signin-btn--invert:hover:not(:disabled) {
          background: #f2f2f2;
          color: #111111;
        }
        .signin-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
          opacity: 0.7;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
        .signin-error {
          margin-top: 10px;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--accent-bad);
          text-align: center;
        }
      `}</style>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
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
