// History route handlers — the authenticated surface of the Supabase store.
//
// Every handler follows the same three steps, in this order:
//   1. Verify the Firebase ID token from the Authorization header.
//   2. Derive the UID from the *verified token*.
//   3. Call the store, which scopes every query to that UID.
//
// A `uid` in the request body is never read. That is what makes cross-user
// access impossible: an attacker can supply any body they like, but the
// owner is always the token's subject.
//
// Dependencies are injected so this module is unit testable with `node --test`
// — no Next.js runtime, no network, no live Supabase.

import { NextRequest, NextResponse } from "next/server";
import {
  extractBearerToken,
  classifyTokenError,
  statusForAuthFailure,
  authFailureMessage,
  type AuthFailureReason,
} from "@/lib/auth-token";
import {
  HistoryStorageError,
  HistoryStorageUnavailableError,
} from "@/lib/server/history-store";

/** What a route needs in order to act as a verified user. */
export interface HistoryHandlers {
  verifyToken(token: string): Promise<string>;
  list(uid: string, limit: number): Promise<unknown[]>;
  create(
    uid: string,
    input: {
      originalFileName: string;
      originalFileSize: number;
      fileType: "pdf" | "docx" | "pptx";
      clientRef: string;
    }
  ): Promise<unknown>;
  update(
    uid: string,
    id: string,
    patch: {
      status?: unknown;
      pageCount?: unknown;
      errorMessage?: unknown;
      outputFileName?: unknown;
    }
  ): Promise<unknown | null>;
}

function unauthorized(reason: AuthFailureReason) {
  return NextResponse.json(
    { error: authFailureMessage(reason), code: `auth/${reason}` },
    { status: statusForAuthFailure(reason) }
  );
}

/**
 * Resolve the caller's verified UID, or a ready-to-return error response.
 *
 * Shared by every handler so the auth path can never diverge between routes.
 */
export async function authenticateRequest(
  request: Pick<NextRequest, "headers">,
  handlers: Pick<HistoryHandlers, "verifyToken">
): Promise<{ uid: string } | NextResponse> {
  const parsed = extractBearerToken(request.headers.get("authorization"));
  if (!parsed.ok) return unauthorized(parsed.reason);

  let uid: string;
  try {
    uid = await handlers.verifyToken(parsed.token);
  } catch (error) {
    const reason = classifyTokenError(error);
    if (reason === "verification-unavailable" || reason === "configuration-error") {
      console.error("Noctra Firebase token verification failure", {
        reason,
        code:
          typeof error === "object" && error !== null &&
          typeof (error as { code?: unknown }).code === "string"
            ? (error as { code: string }).code
            : "unclassified",
      });
    }
    return unauthorized(reason);
  }

  // A token that verifies but carries no subject is not a usable identity.
  if (typeof uid !== "string" || uid.length === 0) {
    return unauthorized("invalid-token");
  }
  return { uid };
}

/** Map storage-layer failures onto honest HTTP statuses. */
function storageErrorResponse(error: unknown) {
  if (error instanceof HistoryStorageUnavailableError) {
    console.error("Noctra history storage unavailable", {
      code: error.code,
    });
    return NextResponse.json(
      {
        error: "History storage is unavailable on this deployment. Your conversions still work.",
        code: error.code,
      },
      { status: 503 }
    );
  }
  const reason = error instanceof HistoryStorageError ? error.reason : "unknown";
  const status =
    reason === "schema-mismatch" || reason === "connection-failed" ? 503 : 502;
  const message =
    reason === "schema-mismatch"
      ? "History storage is not ready on this deployment. Apply the Noctra Supabase migration."
      : reason === "permission-denied"
        ? "History storage rejected the server request. Check the Supabase service-role configuration."
        : reason === "connection-failed"
          ? "History storage could not be reached. Your conversion can still finish."
          : "History storage failed. Your conversion can still finish.";
  console.error("Noctra history storage failure", {
    code: error instanceof HistoryStorageError ? error.code : "history/storage-error",
    reason,
  });
  return NextResponse.json(
    { error: message, code: "history/storage-error", reason },
    { status }
  );
}

/** GET /api/history — list the caller's own records, newest first. */
export async function handleList(
  request: NextRequest,
  handlers: HistoryHandlers
) {
  const auth = await authenticateRequest(request, handlers);
  if (auth instanceof NextResponse) return auth;

  try {
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw === null ? 20 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "limit must be an integer between 1 and 100.", code: "request/invalid" },
        { status: 400 }
      );
    }
    const items = await handlers.list(
      auth.uid,
      limit
    );
    return NextResponse.json({ conversions: items });
  } catch (error) {
    return storageErrorResponse(error);
  }
}

/** POST /api/history — create a record owned by the verified caller. */
export async function handleCreate(
  request: NextRequest,
  handlers: HistoryHandlers
) {
  const auth = await authenticateRequest(request, handlers);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON.", code: "request/invalid" },
      { status: 400 }
    );
  }

  const record = (body ?? {}) as Record<string, unknown>;
  const originalFileName = record.originalFileName;
  const originalFileSize = record.originalFileSize;
  const fileType = record.fileType;
  const clientRef = record.clientRef;

  if (
    typeof originalFileName !== "string" ||
    originalFileName.length === 0 ||
    typeof originalFileSize !== "number" ||
    !Number.isFinite(originalFileSize) ||
    (fileType !== "pdf" && fileType !== "docx" && fileType !== "pptx") ||
    typeof clientRef !== "string" ||
    clientRef.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "A conversion record needs originalFileName, originalFileSize, fileType and clientRef.",
        code: "request/invalid",
      },
      { status: 400 }
    );
  }

  try {
    const created = await handlers.create(auth.uid, {
      originalFileName,
      originalFileSize,
      fileType,
      clientRef,
    });
    return NextResponse.json({ conversion: created }, { status: 201 });
  } catch (error) {
    return storageErrorResponse(error);
  }
}

/** PATCH /api/history/:id — update a record the caller owns. */
export async function handleUpdate(
  request: NextRequest,
  handlers: HistoryHandlers,
  id: string
) {
  const auth = await authenticateRequest(request, handlers);
  if (auth instanceof NextResponse) return auth;

  if (typeof id !== "string" || id.length === 0) {
    return NextResponse.json(
      { error: "A record id is required.", code: "request/invalid" },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON.", code: "request/invalid" },
      { status: 400 }
    );
  }

  const patch = (body ?? {}) as Record<string, unknown>;
  if (
    patch.status !== "processing" &&
    patch.status !== "completed" &&
    patch.status !== "failed" &&
    patch.pageCount === undefined &&
    patch.errorMessage === undefined &&
    patch.outputFileName === undefined
  ) {
    return NextResponse.json(
      { error: "Nothing to update.", code: "request/invalid" },
      { status: 400 }
    );
  }

  try {
    const updated = await handlers.update(auth.uid, id, {
      status: patch.status,
      pageCount: patch.pageCount,
      errorMessage: patch.errorMessage,
      outputFileName: patch.outputFileName,
    });
    // 404 rather than 403: confirming a record exists but belongs to someone
    // else would leak that it exists.
    if (!updated) {
      return NextResponse.json(
        { error: "Record not found.", code: "history/not-found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ conversion: updated });
  } catch (error) {
    return storageErrorResponse(error);
  }
}
