// Firebase client-side SDK initialization.
// Only NEXT_PUBLIC_ variables are safe to use here — they are bundled into the browser.

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  type Auth,
  type AuthError,
} from "firebase/auth";
import {
  missingFirebaseConfigKeys,
  firebaseConfigErrorMessage,
} from "@/lib/firebase-config";

/**
 * When the env vars are absent we must NOT call getAuth():
 * Firebase throws `auth/invalid-api-key` at module load, which would white-
 * screen every route — including the landing page, which does not need auth
 * at all. Instead we export nulls plus a human-readable reason, and the auth
 * UI degrades to an explanatory message.
 */
const rawConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const missingKeys = missingFirebaseConfigKeys(rawConfig);
const configError = firebaseConfigErrorMessage(missingKeys);

/** Non-null only when every required NEXT_PUBLIC_FIREBASE_* var is set. */
export const isFirebaseConfigured = configError === null;

/** Human-readable explanation of an incomplete config, else null. */
export const firebaseConfigError: string | null = configError;

let app: FirebaseApp | null = null;
export let auth: Auth | null = null;
export let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  // Prevent re-initialization during Next.js hot reloads
  app = getApps().length ? getApp() : initializeApp(rawConfig);

  // Firebase Authentication only. Document storage lives in Supabase, reached
  // through the /api/history route handlers — so no Firestore instance exists
  // in this bundle at all.
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();

  // Request profile and email scopes from Google
  googleProvider.addScope("profile");
  googleProvider.addScope("email");
}

/**
 * Narrowing helper for callers that already know Firebase is configured
 * (i.e. they are inside the authenticated dashboard). Throws with the
 * actionable config message rather than a cryptic SDK error.
 */
export function requireAuth(): Auth {
  if (!auth) {
    throw new Error(
      firebaseConfigError ?? "Firebase Authentication is unavailable."
    );
  }
  return auth;
}

/** True for the specific "your session is gone, sign in again" failures. */
export function isAuthError(e: unknown): e is AuthError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string" &&
    (e as { code: string }).code.startsWith("auth/")
  );
}
