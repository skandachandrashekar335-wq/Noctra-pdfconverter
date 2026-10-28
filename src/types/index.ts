// Shared TypeScript types for Noctra

export type ConversionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Runtime lifecycle of one conversion, as the UI observes it.
 *
 * Deliberately separate from `ConversionStatus`: that union is what gets
 * persisted (the `conversions.status` CHECK constraint in Postgres), while
 * this one adds the two in-flight states users actually experience —
 * `queued` (accepted, not yet rendering) and `finalizing` (pages done,
 * output still being assembled and validated).
 *
 * Persistence mapping: queued → pending, processing → processing,
 * finalizing → processing, and the three terminal states map 1:1.
 */
export type ConversionPhase =
  | "queued"
  | "processing"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: number; // Unix timestamp ms
}

export interface Conversion {
  id: string;
  /** Firebase UID of the owner. Set server-side from the verified token. */
  userId: string;
  originalFileName: string;
  originalFileSize: number; // bytes
  /** Derived name for the dark-mode output, e.g. `notes-dark.pdf`. */
  outputFileName?: string;
  /** Optional user-facing label; originalFileName remains the source metadata. */
  displayName?: string;
  /** User-owned organization metadata, never used for authorization. */
  isFavorite?: boolean;
  tags?: string[];
  /** SHA-256 identity of the locally opened source document, when available. */
  documentKey?: string;
  fileType: "pdf" | "docx" | "pptx";
  status: ConversionStatus;
  createdAt: number; // Unix timestamp ms
  completedAt?: number;
  errorMessage?: string;
  pageCount?: number;
}

export interface ConvertApiRequest {
  fileName: string;
  fileType: "pdf" | "docx" | "pptx";
  // base64-encoded file content
  fileData: string;
}

export interface ConvertApiResponse {
  success: boolean;
  conversionId?: string;
  outputDataUrl?: string;
  pageCount?: number;
  error?: string;
}

export type ReaderAnnotationKind = "bookmark" | "note" | "highlight";

export interface ReaderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReaderAnnotation {
  id: string;
  userId: string;
  documentKey: string;
  pageNumber: number;
  kind: ReaderAnnotationKind;
  quote?: string;
  note?: string;
  rects?: ReaderRect[];
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export type ReaderTheme = "night" | "sepia" | "paper";

export interface ReaderPreferences {
  documentKey: string;
  pageNumber: number;
  zoom: number;
  theme: ReaderTheme;
  updatedAt: number;
}
