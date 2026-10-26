"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import {
  User,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  auth,
  googleProvider,
  isFirebaseConfigured,
  firebaseConfigError,
} from "@/lib/firebase";
import { classifyAuthError } from "@/lib/auth-errors";
import { buildUserProfile } from "@/lib/access-control";
import { UserProfile } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  /** True only while Firebase is resolving the persisted session. */
  loading: boolean;
  /**
   * Set when signing in failed or was cancelled. Null after a successful
   * sign-in or when a new attempt starts.
   */
  error: string | null;
  /** Non-null when the NEXT_PUBLIC_FIREBASE_* env vars are incomplete. */
  configError: string | null;
  /** Clears the current `error` (e.g. when the user dismisses the message). */
  clearError: () => void;
  /** True while any Google popup request is in flight. */
  signingIn: boolean;
  /** Resolves true only when this call started and completed sign-in. */
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // If Firebase is not configured there is no session to resolve, so loading
  // starts false and the effect below has no setState to call.
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const signInInFlight = useRef(false);

  // Profile is derived purely from the Firebase user object — nothing is
  // persisted. displayName, email and photoURL all arrive with the session,
  // so there is no round-trip, no first-login write to fail, and no document
  // that could drift out of sync with Google. `buildUserProfile` whitelists
  // the three fields the UI shows, so provider extras never reach state.
  useEffect(() => {
    // Incomplete env vars: there is no Firebase instance to subscribe to.
    // `loading` was initialised to false in that case, so bail out without
    // touching state (the lint rule forbids synchronous setState here).
    if (!auth) return;

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (cancelled) return;
      setUser(firebaseUser);
      // Pure and synchronous: no storage, no network, nothing to await.
      setProfile(firebaseUser ? buildUserProfile(firebaseUser) : null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    // The landing page renders several entry points (header, hero, closing
    // CTA, and footer). A ref-based gate prevents two of them from opening
    // competing Google popups before React has rendered the disabled state.
    if (signInInFlight.current) return false;

    if (!auth || !googleProvider) {
      setError(firebaseConfigError ?? "Google sign-in is unavailable.");
      return false;
    }

    signInInFlight.current = true;
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged above derives the profile from the user object
      return true;
    } catch (e) {
      const classified = classifyAuthError(e);
      // The message is safe to render and includes a short acknowledgement
      // when the user closes or cancels the popup.
      if (!classified.shouldStaySilent) setError(classified.message);
      throw e;
    } finally {
      signInInFlight.current = false;
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!auth) return;
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged(null) clears user + profile. There are no other
      // credentials, cookies, or cached tokens held client-side; the history
      // API rejects any request whose bearer token no longer verifies.
    } catch (e) {
      console.error("Sign-out failed:", e);
      setError("Sign-out failed. Check your connection and try again.");
      throw e;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        configError: isFirebaseConfigured ? null : firebaseConfigError,
        clearError,
        signingIn,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
