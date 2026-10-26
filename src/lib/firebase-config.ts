/**
 * Pure validation for the Firebase web configuration.
 *
 * No Firebase SDK imports, so this is unit tested with `node --test` and no
 * live credentials. It exists so a missing/blank env var degrades into a clear
 * message instead of an `auth/invalid-api-key` crash at module load.
 */

/** The client-side config keys the app cannot run without. */
export const REQUIRED_FIREBASE_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

export type FirebaseConfigKey = (typeof REQUIRED_FIREBASE_CONFIG_KEYS)[number];

/** Loose shape — values arrive straight from `process.env`, so they may be
 *  undefined or an empty/whitespace string when unset. */
export type FirebaseEnvInput = Partial<Record<FirebaseConfigKey, unknown>>;

/**
 * Map a config key back to the env var the operator has to set, so error
 * messages are actionable rather than naming internal Firebase fields.
 */
export function envVarNameFor(key: FirebaseConfigKey): string {
  const SCREAMING = {
    apiKey: "API_KEY",
    authDomain: "AUTH_DOMAIN",
    projectId: "PROJECT_ID",
    storageBucket: "STORAGE_BUCKET",
    messagingSenderId: "MESSAGING_SENDER_ID",
    appId: "APP_ID",
  } as const;
  return `NEXT_PUBLIC_FIREBASE_${SCREAMING[key]}`;
}

/**
 * Return the config keys that are missing or blank (whitespace-only counts as
 * unset). An empty array means the configuration is complete.
 */
export function missingFirebaseConfigKeys(env: FirebaseEnvInput): string[] {
  return REQUIRED_FIREBASE_CONFIG_KEYS.filter((key) => {
    const value = env[key];
    return typeof value !== "string" || value.trim() === "";
  });
}

/**
 * Human-readable explanation of an incomplete Firebase configuration, or null
 * when the config is complete. Surfaced by the auth UI instead of crashing.
 */
export function firebaseConfigErrorMessage(missingKeys: string[]): string | null {
  if (missingKeys.length === 0) return null;
  const vars = missingKeys
    .map((k) => envVarNameFor(k as FirebaseConfigKey))
    .join(", ");
  return (
    `Firebase is not configured — missing environment variables: ${vars}. ` +
    "Copy .env.example to .env.local and fill in your Firebase web-app values."
  );
}
