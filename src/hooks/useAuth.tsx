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

export interface NoctraAuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
}

export type AnyAuthUser = User | NoctraAuthUser;

interface AuthContextValue {
  user: AnyAuthUser | null;
  profile: UserProfile | null;
  /** True only while resolving the persisted session. */
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
  /** True while any sign-in request is in flight. */
  signingIn: boolean;
  /** Resolves true only when this call started and completed sign-in. */
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; message: string }>;
  requestPasswordReset: (
    email: string
  ) => Promise<{ success: boolean; message: string }>;
  confirmPasswordReset: (
    password: string,
    token: string
  ) => Promise<{ success: boolean; message: string }>;
  deleteAccount: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const LOCAL_SESSION_KEY = "noctra_auth_session";

function restoreLocalSession(): { user: NoctraAuthUser; token: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.user?.uid || !parsed.token) return null;
    // Expired?
    if (parsed.expiresAt && Date.now() / 1000 > parsed.expiresAt) {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      return null;
    }
    const token = parsed.token as string;
    const user: NoctraAuthUser = {
      uid: parsed.user.uid,
      displayName: parsed.user.displayName ?? null,
      email: parsed.user.email ?? null,
      photoURL: null,
      getIdToken: async () => token,
    };
    return { user, token };
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AnyAuthUser | null>(() => {
    const local = restoreLocalSession();
    return local ? local.user : null;
  });
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const local = restoreLocalSession();
    return local ? buildUserProfile(local.user) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const local = restoreLocalSession();
    if (local) return false;
    return Boolean(auth);
  });
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const signInInFlight = useRef(false);

  // Restore local session or listen to Firebase
  useEffect(() => {
    if (!auth) return;

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (cancelled) return;
      if (firebaseUser) {
        setUser(firebaseUser);
        setProfile(buildUserProfile(firebaseUser));
      } else {
        // If not in Firebase, check local session again in case it just saved
        const fallback = restoreLocalSession();
        if (fallback) {
          setUser(fallback.user);
          setProfile(buildUserProfile(fallback.user));
        } else {
          setUser(null);
          setProfile(null);
        }
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
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
      return true;
    } catch (e) {
      const classified = classifyAuthError(e);
      if (!classified.shouldStaySilent) setError(classified.message);
      throw e;
    } finally {
      signInInFlight.current = false;
      setSigningIn(false);
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setSigningIn(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to sign in.");
          return false;
        }

        const token = data.token;
        const sessionUser: NoctraAuthUser = {
          uid: data.user.uid,
          displayName: data.user.displayName,
          email: data.user.email,
          photoURL: null,
          getIdToken: async () => token,
        };

        if (typeof window !== "undefined") {
          localStorage.setItem(
            LOCAL_SESSION_KEY,
            JSON.stringify({
              user: data.user,
              token,
              expiresAt: data.expiresAt,
            })
          );
        }

        setUser(sessionUser);
        setProfile(buildUserProfile(sessionUser));
        return true;
      } catch {
        setError("Network error occurred during sign-in.");
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    []
  );

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string
    ): Promise<{ success: boolean; message: string }> => {
      setSigningIn(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Sign-up failed.");
          return { success: false, message: data.error || "Sign-up failed." };
        }

        if (data.session?.token && data.user) {
          const token = data.session.token;
          const sessionUser: NoctraAuthUser = {
            uid: data.user.uid,
            displayName: data.user.displayName ?? data.user.email?.split("@")[0] ?? "User",
            email: data.user.email,
            photoURL: null,
            getIdToken: async () => token,
          };
          if (typeof window !== "undefined") {
            localStorage.setItem(
              LOCAL_SESSION_KEY,
              JSON.stringify({
                user: data.user,
                token,
              })
            );
          }
          setUser(sessionUser);
          setProfile(buildUserProfile(sessionUser));
        }

        return {
          success: true,
          message: data.message || "Account registered successfully.",
        };
      } catch {
        const message = "Network error during registration.";
        setError(message);
        return { success: false, message };
      } finally {
        setSigningIn(false);
      }
    },
    []
  );

  const requestPasswordReset = useCallback(
    async (email: string): Promise<{ success: boolean; message: string }> => {
      setError(null);
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        return {
          success: res.ok,
          message: data.message || "Password reset link sent.",
        };
      } catch {
        return {
          success: false,
          message: "Network error requesting password reset.",
        };
      }
    },
    []
  );

  const confirmPasswordReset = useCallback(
    async (
      password: string,
      token: string
    ): Promise<{ success: boolean; message: string }> => {
      setError(null);
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, message: data.error || "Failed to reset password." };
        }
        return {
          success: true,
          message: data.message || "Password updated successfully.",
        };
      } catch {
        return {
          success: false,
          message: "Network error updating password.",
        };
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    try {
      if (auth) {
        await firebaseSignOut(auth).catch(() => {});
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(LOCAL_SESSION_KEY);
      }
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      setUser(null);
      setProfile(null);
    } catch (e) {
      console.error("Sign-out failed:", e);
      setError("Sign-out failed. Check your connection and try again.");
    }
  }, []);

  const deleteAccount = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to delete account.");
        return false;
      }
      await signOut();
      return true;
    } catch {
      setError("Failed to delete account. Please try again.");
      return false;
    }
  }, [user, signOut]);

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
        signInWithEmail,
        signUpWithEmail,
        requestPasswordReset,
        confirmPasswordReset,
        deleteAccount,
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
