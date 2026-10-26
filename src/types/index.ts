// Shared TypeScript types for Noctra

export type ConversionStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

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
