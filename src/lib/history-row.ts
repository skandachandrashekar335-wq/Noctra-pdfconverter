/**
 * Conversion row mapping — pure.
 *
 * Supabase returns snake_case Postgres rows; the UI consumes the camelCase
 * `Conversion` type it has always rendered. Keeping the translation
 * here means the history UI keeps its exact current behaviour, and the
 * mapping is unit tested without a database.
 *
 * No Supabase imports, so `node --test` runs it with no credentials.
 */

import type { Conversion, ConversionStatus } from "@/types";

/** A `conversions` row exactly as Postgres returns it. */
export interface ConversionRow {
  id: string;
  user_uid: string;
  client_ref: string;
  original_file_name: string;
  original_file_size: number;
  output_file_name: string | null;
  file_type: string;
  status: string;
  page_count: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUSES: readonly ConversionStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
];

/**
 * Coerce an untrusted status string to a known `ConversionStatus`.
 *
 * The CHECK constraint in the schema already enforces this, but a migration
 * applied out of order (or a hand-edited row) should degrade to `pending`
 * rather than render an unstyled unknown badge.
 */
export function toConversionStatus(value: unknown): ConversionStatus {
  return typeof value === "string" &&
    (STATUSES as readonly string[]).includes(value)
    ? (value as ConversionStatus)
    : "pending";
}

/** Coerce an untrusted file-type string to a known `Conversion["fileType"]`. */
export function toFileType(value: unknown): Conversion["fileType"] {
  if (value === "docx") return "docx";
  return value === "pptx" ? "pptx" : "pdf";
}

/** Parse a Postgres timestamp into the Unix-millisecond number the UI renders. */
export function toUnixMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.length === 0) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Map a database row to the `Conversion` shape the history UI expects.
 *
 * `createdAt`/`completedAt` become Unix milliseconds to match the existing
 * `Conversion` contract, so `formatDate()` in `ConversionList` is unchanged.
 */
export function rowToConversion(row: ConversionRow): Conversion {
  const completedAt = toUnixMs(row.completed_at);
  return {
    id: row.id,
    userId: row.user_uid,
    originalFileName: row.original_file_name,
    originalFileSize: Number(row.original_file_size) || 0,
    outputFileName: toOptionalString(row.output_file_name),
    fileType: toFileType(row.file_type),
    status: toConversionStatus(row.status),
    createdAt: toUnixMs(row.created_at),
    pageCount: toOptionalNumber(row.page_count),
    errorMessage: toOptionalString(row.error_message),
    ...(completedAt > 0 ? { completedAt } : {}),
  };
}

/**
 * Whitelist the fields a client may submit when creating a record.
 *
 * Anything not listed here — a forged `user_uid`, an invented `id`, a
 * `created_at` in the past — is dropped before it reaches Postgres. The owner
 * is stamped server-side from the verified token, never from this object.
 */
export interface NewConversionInput {
  originalFileName: string;
  originalFileSize: number;
  fileType: Conversion["fileType"];
  clientRef: string;
}

export function sanitizeNewConversion(
  input: NewConversionInput
): Record<string, unknown> {
  return {
    client_ref: input.clientRef,
    original_file_name: String(input.originalFileName).slice(0, 512),
    original_file_size: Math.max(0, Math.floor(input.originalFileSize)),
    file_type:
      input.fileType === "docx" ? "docx" : input.fileType === "pptx" ? "pptx" : "pdf",
    status: "pending",
  };
}

/**
 * Statuses a client is allowed to write. The `WRITABLE` set exists purely to
 * validate input — see `sanitizeStatusUpdate`.
 */
const WRITABLE_STATUSES = new Set<ConversionStatus>([
  "pending",
  "processing",
  "completed",
  "failed",
]);

/**
 * Whitelist the fields a client may patch on an existing record.
 *
 * Deliberately excludes `user_uid`, `client_ref`, `original_file_name`,
 * `original_file_size`, `file_type` and `created_at`: those describe the file
 * and its owner, neither of which a status update may rewrite.
 *
 * Unlike `toConversionStatus` — which coerces an unexpected value so a bad
 * row still renders — an unexpected status here is *rejected* (the patch is
 * dropped). Silently rewriting a client's invalid input into a valid write
 * would hide the mistake rather than surface it.
 */
export function sanitizeStatusUpdate(input: {
  status?: unknown;
  pageCount?: unknown;
  errorMessage?: unknown;
  outputFileName?: unknown;
}): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !WRITABLE_STATUSES.has(input.status as ConversionStatus)
    ) {
      return null; // refuse the whole patch rather than apply part of it
    }
    patch.status = input.status;
  }

  const terminal = patch.status === "completed" || patch.status === "failed";

  const pageCount = toOptionalNumber(input.pageCount);
  if (pageCount !== undefined && pageCount > 0) {
    patch.page_count = Math.floor(pageCount);
  }
  if (typeof input.errorMessage === "string" && input.errorMessage.length) {
    patch.error_message = input.errorMessage.slice(0, 2000);
  }
  if (typeof input.outputFileName === "string" && input.outputFileName.length) {
    patch.output_file_name = input.outputFileName.slice(0, 512);
  }
  if (terminal) {
    // Server clock, not client clock: the client never supplies this.
    patch.completed_at = new Date().toISOString();
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
