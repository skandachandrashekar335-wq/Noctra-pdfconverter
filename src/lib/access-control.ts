/**
 * Pure auth / data-isolation helpers.
 *
 * No Firebase or Supabase imports, so these can be unit tested with
 * `node --test` and no live credentials. They encode the client-side half of
 * the data-isolation contract that the `/api/history` route handlers and
 * Supabase row level security enforce server-side.
 */

import type { UserProfile } from "@/types";

/** The subset of a Firebase user needed to build a profile object */
export interface AuthUserLike {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/**
 * Derive the display profile from an authenticated user.
 *
 * Only whitelisted fields are copied — extra properties that auth providers
 * attach to the user object (tokens, providerData, etc.) are never held in
 * state. The result is *not* persisted anywhere: everything the dashboard
 * shows arrives with the Firebase session.
 */
export function buildUserProfile(
  user: AuthUserLike,
  now: number = Date.now()
): UserProfile {
  if (!user.uid) {
    throw new Error("buildUserProfile: user.uid is required");
  }
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    createdAt: now,
  };
}

/**
 * Client-side ownership check for a record that carries a `userId` field.
 * Mirrors the server-side rule — every `/api/history` query is scoped by the
 * UID derived from the *verified* Firebase token — as a defense-in-depth
 * check before rendering a record. It can only ever remove a row; it is never
 * the security boundary.
 */
export function canAccessConversion(
  doc: { userId?: string } | null | undefined,
  uid: string | null | undefined
): boolean {
  if (!uid) return false;
  if (!doc || typeof doc.userId !== "string") return false;
  return doc.userId === uid;
}
