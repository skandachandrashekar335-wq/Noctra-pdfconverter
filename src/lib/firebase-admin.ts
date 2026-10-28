// Firebase Admin SDK — server-side only.
// NEVER import this file in client components or pages that run in the browser.
//
// Used exclusively by the `/api/history` route handlers to verify the Firebase
// ID token that a signed-in client sends in the `Authorization` header. The
// verified UID derived here is the *only* source of user identity the database
// layer ever trusts — a UID in a request body is ignored.

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

/**
 * Returns the shared Admin app, initialising it on first use.
 *
 * `projectId` is optional here: with only a project ID and no credential the
 * Admin SDK falls back to Google's public x509 certs, which is enough to
 * *verify* ID tokens issued by that project (verification needs no private
 * key — only signing and admin operations do). That means token verification
 * keeps working even when the service-account key is absent, as long as
 * FIREBASE_ADMIN_PROJECT_ID matches the project the tokens come from.
 *
 * Throws with an actionable message when the config is incomplete, rather
 * than the SDK's cryptic `Failed to determine service account`.
 */
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      "Firebase Admin is not configured: set FIREBASE_ADMIN_PROJECT_ID " +
        "(or NEXT_PUBLIC_FIREBASE_PROJECT_ID) so ID tokens can be verified."
    );
  }

  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // The private key comes from an env var with literal \n characters that need
  // to be converted to real newlines.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n"
  );

  // With a full service account we can also call admin APIs (e.g. listing
  // users). With only a project ID we can still verify tokens.
  const credential =
    clientEmail && privateKey
      ? cert({ projectId, clientEmail, privateKey })
      : undefined;

  // The Admin SDK validates the *shape* of the options object: if the
  // `credential` key is present at all it must be a Credential instance.
  // Passing `credential: undefined` is therefore rejected outright
  // ("The "credential" property must be an object which implements the
  // Credential interface"), which silently defeated the public-x509
  // verification fallback documented above. Build the options without that
  // key whenever there is no credential to put in it.
  return credential
    ? initializeApp({ credential, projectId })
    : initializeApp({ projectId });
}

/** Auth instance used to verify incoming ID tokens. */
export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

/**
 * Verify a Firebase ID token and return its UID.
 *
 * Rejects when the token is malformed, expired, revoked, or was issued by a
 * different Firebase project than the one configured here.
 */
export async function verifyIdToken(token: string): Promise<string> {
  const decoded = await getAdminAuth().verifyIdToken(token);
  return decoded.uid;
}
