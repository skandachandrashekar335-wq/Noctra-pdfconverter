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
  userId: string;
  originalFileName: string;
  originalFileSize: number; // bytes
  fileType: "pdf" | "pptx";
  status: ConversionStatus;
  createdAt: number; // Unix timestamp ms
  completedAt?: number;
  errorMessage?: string;
  // Stored as base64 data URL in Firestore (for small files)
  // or as a download token pointing to Firebase Storage (large files)
  outputDataUrl?: string;
  outputDownloadUrl?: string;
  pageCount?: number;
}

export interface ConvertApiRequest {
  fileName: string;
  fileType: "pdf" | "pptx";
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
