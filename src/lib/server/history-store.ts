// Supabase-backed conversion history — server-side only.
//
// Every function here takes a `uid` that the route handler obtained by
// *verifying* the caller's Firebase ID token. Nothing in this file reads an
// owner from a request body. That is the security boundary: the service-role
// key bypasses RLS, so the ownership scoping must — and does — happen here.
//
// NEVER import this file from a client component. `next.config.ts` does not
// need to stub it: it is only ever imported by route handlers, which Next.js
// bundles for the server.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  missingSupabaseConfigKeys,
  readSupabaseServerConfig,
  supabaseConfigErrorMessage,
} from "@/lib/supabase-config";
import {
  rowToConversion,
  sanitizeNewConversion,
  sanitizeStatusUpdate,
  type ConversionRow,
} from "@/lib/history-row";
import type { Conversion } from "@/types";

/** Raised when Supabase is not configured. Routes map this to a 503. */
export class HistoryStorageUnavailableError extends Error {
  readonly code = "history/storage-unavailable";
  constructor(message: string) {
    super(message);
    this.name = "HistoryStorageUnavailableError";
  }
}

/**
 * Raised when Supabase is reachable but refused the operation. Routes map
 * this to a 502 and the client surfaces it as a *history* failure — never as
 * a conversion failure.
 */
export class HistoryStorageError extends Error {
  readonly code = "history/storage-error";
  readonly reason:
    | "schema-mismatch"
    | "permission-denied"
    | "connection-failed"
    | "unknown";
  constructor(
    message: string,
    reason:
      | "schema-mismatch"
      | "permission-denied"
      | "connection-failed"
      | "unknown" = "unknown"
  ) {
    super(message);
    this.name = "HistoryStorageError";
    this.reason = reason;
  }
}

// Cache the client across dev hot-reloads and warm invocations.
let cached: SupabaseClient | null | undefined;

function getServiceClient(): SupabaseClient {
  if (cached !== undefined && cached !== null) return cached;

  const config = readSupabaseServerConfig();
  if (!config) {
    throw new HistoryStorageUnavailableError(
      supabaseConfigErrorMessage(missingSupabaseConfigKeys()) ??
        "History storage is not configured."
    );
  }

  cached = createClient(config.url, config.serviceRoleKey, {
    auth: {
      // The service role is a server credential with no interactive session.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}

const SELECT_COLUMNS = [
  "id",
  "user_uid",
  "client_ref",
  "original_file_name",
  "original_file_size",
  "output_file_name",
  "display_name",
  "is_favorite",
  "tags",
  "document_key",
  "file_type",
  "status",
  "page_count",
  "error_message",
  "created_at",
  "completed_at",
].join(", ");

// Keep existing deployments usable until migration 0003 is applied. New
// organization fields are optional metadata; status/history must not go dark
// merely because the additive migration is waiting for an approved rollout.
const LEGACY_SELECT_COLUMNS = [
  "id",
  "user_uid",
  "client_ref",
  "original_file_name",
  "original_file_size",
  "output_file_name",
  "file_type",
  "status",
  "page_count",
  "error_message",
  "created_at",
  "completed_at",
].join(", ");

function classifyStorageFailure(error: unknown): HistoryStorageError["reason"] {
  const value = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof value?.code === "string" ? value.code : "";
  const status = typeof value?.status === "number" ? value.status : 0;
  const message = typeof value?.message === "string" ? value.message : "";

  if (
    status === 401 ||
    status === 403 ||
    /permission|forbidden|not allowed|invalid api key|jwt/i.test(message) ||
    code === "42501"
  ) {
    return "permission-denied";
  }
  if (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    /does not exist|schema cache|column .* not found|relation .* not found/i.test(message)
  ) {
    return "schema-mismatch";
  }
  if (
    /fetch failed|network|timeout|timed out|connection|could not connect|econn/i.test(
      message
    )
  ) {
    return "connection-failed";
  }
  return "unknown";
}

function isSchemaMismatch(error: unknown): boolean {
  return classifyStorageFailure(error) === "schema-mismatch";
}

function publicStorageMessage(reason: HistoryStorageError["reason"]): string {
  switch (reason) {
    case "schema-mismatch":
      return "History storage is not ready on this deployment. Apply the Noctra Supabase migration.";
    case "permission-denied":
      return "History storage rejected the server request. Check the Supabase service-role configuration.";
    case "connection-failed":
      return "History storage could not be reached. Your conversion can still finish.";
    default:
      return "History storage failed. Your conversion can still finish.";
  }
}

/**
 * Narrow PostgREST's error-or-data result, throwing a mapped error.
 *
 * `data` is accepted as `unknown` because `SELECT_COLUMNS` is a runtime
 * string: supabase-js cannot infer the returned shape from it, so it types
 * the payload as an opaque parse-error union. The columns are a fixed
 * literal we control, so casting here is the honest boundary — `rowToConversion`
 * then validates each field as it maps.
 */
function unwrap<T>(
  result: { data: unknown; error: unknown },
  context: string
): T {
  if (result.error) {
    const reason = classifyStorageFailure(result.error);
    throw new HistoryStorageError(`${context}: ${publicStorageMessage(reason)}`, reason);
  }
  return result.data as T;
}

/**
 * Create a history record. Idempotent on `(user_uid, client_ref)`: a retried
 * request returns the existing row rather than creating a duplicate.
 */
export async function createConversion(
  uid: string,
  input: {
    originalFileName: string;
    originalFileSize: number;
    fileType: Conversion["fileType"];
    clientRef: string;
  }
): Promise<Conversion> {
  const supabase = getServiceClient();
  const row = sanitizeNewConversion(input);

  const upsert = (columns: string) => supabase
    .from("conversions")
    .upsert({ ...row, user_uid: uid }, {
      onConflict: "user_uid,client_ref",
      ignoreDuplicates: false,
    })
    .select(columns)
    .single();
  let result = await upsert(SELECT_COLUMNS);
  if (result.error && isSchemaMismatch(result.error)) result = await upsert(LEGACY_SELECT_COLUMNS);

  const created = unwrap<ConversionRow>(
    { data: result.data, error: result.error },
    "Could not create the history record"
  );
  return rowToConversion(created);
}

/**
 * Patch a record's status/metadata. Scoped to the owner in the query itself,
 * so updating someone else's row is a no-op (0 rows) rather than an error.
 */
export async function updateConversion(
  uid: string,
  id: string,
  patch: {
    status?: unknown;
    pageCount?: unknown;
    errorMessage?: unknown;
    outputFileName?: unknown;
    displayName?: unknown;
    isFavorite?: unknown;
    tags?: unknown;
    documentKey?: unknown;
  }
): Promise<Conversion | null> {
  const fields = sanitizeStatusUpdate(patch);
  if (!fields) return null;

  const supabase = getServiceClient();
  const update = (columns: string) => supabase
    .from("conversions")
    .update(fields)
    .eq("id", id)
    .eq("user_uid", uid) // ownership scoping — the security boundary
    .select(columns)
    .maybeSingle();
  let result = await update(SELECT_COLUMNS);
  if (result.error && isSchemaMismatch(result.error)) {
    const metadataFields = ["display_name", "is_favorite", "tags", "document_key"];
    if (metadataFields.some((field) => field in fields)) {
      throw new HistoryStorageError(
        "Organization metadata requires the Noctra reader migration.",
        "schema-mismatch"
      );
    }
    result = await update(LEGACY_SELECT_COLUMNS);
  }
  const { data, error } = result;

  // null means "not found or not yours" — the route turns that into a 404.
  if (!data) {
    if (error) {
      const reason = classifyStorageFailure(error);
      throw new HistoryStorageError(
        `Could not update the history record: ${publicStorageMessage(reason)}`,
        reason
      );
    }
    return null;
  }
  return rowToConversion(data as unknown as ConversionRow);
}

/** Delete only a record owned by the verified Firebase UID. */
export async function deleteConversion(uid: string, id: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("conversions")
    .delete()
    .eq("id", id)
    .eq("user_uid", uid)
    .select("id")
    .maybeSingle();

  if (error) {
    const reason = classifyStorageFailure(error);
    throw new HistoryStorageError(
      `Could not delete the history record: ${publicStorageMessage(reason)}`,
      reason
    );
  }
  return Boolean(data);
}

/** List a user's records, newest first. Always scoped to the verified UID. */
export async function listConversions(
  uid: string,
  limit = 20
): Promise<Conversion[]> {
  const supabase = getServiceClient();
  const list = (columns: string) => supabase
    .from("conversions")
    .select(columns)
    .eq("user_uid", uid)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  let result = await list(SELECT_COLUMNS);
  if (result.error && isSchemaMismatch(result.error)) result = await list(LEGACY_SELECT_COLUMNS);
  const { data, error } = result;

  const rows = unwrap<ConversionRow[]>(
    { data, error },
    "Could not load the history"
  );
  return (rows ?? []).map(rowToConversion);
}

/** Reset the cached client. Test-only seam. */
export function resetSupabaseClientForTests(): void {
  cached = undefined;
}
