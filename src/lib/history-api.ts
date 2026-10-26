/**
 * Client-side history store — talks to our own API routes, never to Supabase.
 *
 * Implements the same `HistoryStore` contract that `history-tracker.ts`
 * already consumes, so the resilient, ordered, never-blocks-the-conversion
 * behaviour built earlier carries over unchanged. Only the transport moved:
 * Firestore SDK → `fetch` against `/api/history`, authenticated with the
 * user's Firebase ID token.
 *
 * The browser never sees the Supabase URL or the server-only key.
 */

import { auth } from "@/lib/firebase";
import type { HistoryStore } from "@/lib/history-tracker";

/** Why a history operation failed. Drives the message the UI shows. */
export type HistoryFailureReason =
  | "signed-out"
  | "not-configured"
  | "network"
  | "unauthorized"
  | "server-error"
  | "bad-response";

/**
 * Raised when history cannot be saved or loaded.
 *
 * `runConversion` reports this through `onHistoryError` so the UI can say
 * "history wasn't saved" *without* claiming the conversion failed — it didn't.
 *
 * Carries a typed `reason` so callers branch on the outcome rather than
 * pattern-matching message text, which breaks the moment copy changes.
 */
export class HistorySaveError extends Error {
  readonly reason: HistoryFailureReason;
  /** HTTP status when the server responded, else 0. */
  readonly status: number;
  constructor(
    message: string,
    reason: HistoryFailureReason = "server-error",
    status = 0
  ) {
    super(message);
    this.name = "HistorySaveError";
    this.reason = reason;
    this.status = status;
  }
}

/** Human-readable copy for each failure, shown in the history section. */
export function historyFailureMessage(reason: HistoryFailureReason): string {
  switch (reason) {
    case "signed-out":
      return "Your session has expired. Sign in again.";
    case "not-configured":
      return "History storage is not configured on this deployment.";
    case "unauthorized":
      return "Your session has expired. Sign in again.";
    case "server-error":
      return "History storage is unavailable right now. Your conversions still work.";
    case "network":
    case "bad-response":
      return "Could not load your conversion history. Please try again.";
  }
}

/**
 * Supplies a Firebase ID token for the request. Injectable so tests can
 * exercise the transport without a live Firebase session.
 *
 * Returns null when there is no session, which callers treat as "history is
 * unavailable" rather than an error — signing out mid-conversion must not
 * turn a successful conversion into a failure.
 */
export type TokenProvider = () => Promise<string | null>;

const defaultTokenProvider: TokenProvider = async () => {
  const user = auth?.currentUser ?? null;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
};

/**
 * Set once the server reports 503 (Supabase not configured on this deploy).
 *
 * Without it every conversion would make two doomed requests and emit two
 * warnings on a deployment that simply hasn't been set up yet — noise that
 * buries the warnings that matter. Deliberately not persisted: config can
 * change between deploys, and a hard refresh should re-probe.
 */
let storageUnavailable = false;

/** Forget a cached server-unavailable verdict so an explicit retry can re-probe. */
export function resetHistoryAvailability(): void {
  storageUnavailable = false;
}

/** Test-only alias retained for existing transport tests. */
export const resetHistoryAvailabilityForTests = resetHistoryAvailability;

/**
 * Perform an authenticated request against the history API.
 *
 * Throws `HistorySaveError` for anything that is not a success, so the
 * surrounding tracker can log it and carry on.
 */
async function historyFetch(
  path: string,
  init: RequestInit = {},
  getToken: TokenProvider = defaultTokenProvider
): Promise<Response> {
  if (storageUnavailable) {
    throw new HistorySaveError(
      "History storage is not configured on this deployment.",
      "not-configured"
    );
  }

  const token = await getToken();
  if (!token) {
    throw new HistorySaveError(
      "You are signed out, so this conversion was not added to your history.",
      "signed-out"
    );
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
  } catch {
    throw new HistorySaveError(
      "Could not reach the history service.",
      "network"
    );
  }

  if (!response.ok) {
    // A 503 is a server-side dependency/configuration outage. Remember it so
    // a failing deployment does not generate a request on every refresh. An
    // explicit retry clears this verdict.
    if (response.status === 503) storageUnavailable = true;

    const reason: HistoryFailureReason =
      response.status === 503
        ? "not-configured"
        : response.status === 401
          ? "unauthorized"
          : "server-error";

    // 503 = not configured, 401 = session no longer valid. Both are history
    // problems, not conversion problems.
    let detail = "";
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === "string") detail = ` ${body.error}`;
    } catch {
      /* body may not be JSON — the status alone is enough */
    }
    throw new HistorySaveError(
      `History was not saved (server returned ${response.status}).${detail}`,
      reason,
      response.status
    );
  }

  return response;
}

/** UUID for idempotent creation; falls back where crypto.randomUUID is absent. */
function newClientRef(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Build the store handed to `createHistoryTracker`.
 *
 * `clientRef` is generated once per conversion and reused by every call, so a
 * retried create upserts the same row instead of duplicating it.
 *
 * `getToken` defaults to reading the live Firebase session; tests inject a
 * stub.
 */
export function createRemoteHistoryStore(
  getToken: TokenProvider = defaultTokenProvider
): HistoryStore & {
  clientRef: string;
} {
  const clientRef = newClientRef();

  return {
    clientRef,

    async create(data): Promise<string> {
      const response = await historyFetch(
        "/api/history",
        {
          method: "POST",
          body: JSON.stringify({ ...data, clientRef }),
        },
        getToken
      );
      const body = (await response.json()) as { conversion?: { id?: string } };
      const id = body?.conversion?.id;
      if (typeof id !== "string" || id.length === 0) {
        throw new HistorySaveError(
          "History service returned no record id.",
          "bad-response"
        );
      }
      return id;
    },

    async update(id, data): Promise<void> {
      await historyFetch(
        `/api/history/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
        getToken
      );
    },
  };
}

/** Fetch the signed-in user's history, newest first. */
export async function fetchHistory(
  getToken: TokenProvider = defaultTokenProvider
): Promise<Response> {
  return historyFetch("/api/history?limit=20", {}, getToken);
}
