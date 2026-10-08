/**
 * Noctra conversion orchestrator — runs in the browser.
 *
 * Flow:
 *  1. Validate file type and size
 *  2. Create a Firestore conversion record (status: pending)
 *  3. Run the appropriate converter in-browser (PDF.js / JSZip)
 *  4. Update Firestore record with result / error
 *  5. Return download URL (data URL for files ≤ 10 MB, else stored externally)
 *
 * Why browser-side?  Vercel's serverless functions have a 10s timeout and
 * a 4 MB request body limit for Hobby plans, both too small for real documents.
 * Running the conversion in the browser avoids both limits and keeps the
 * architecture simple — the API layer is only used for Firestore writes that
 * require server-side Firebase Admin SDK verification.
 */

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Conversion, ConversionStatus } from "@/types";

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const SUPPORTED_TYPES = ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"] as const;

export function validateFile(file: File): string | null {
  if (!SUPPORTED_TYPES.includes(file.type as typeof SUPPORTED_TYPES[number])) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "pptx") {
      return "Only PDF and PPTX files are supported.";
    }
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return `File exceeds the 50 MB limit (yours is ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  }
  return null;
}

export function detectFileType(file: File): "pdf" | "pptx" {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pptx") return "pptx";
  return "pdf";
}

export interface ConversionCallbacks {
  onStatusChange?: (status: ConversionStatus) => void;
  onProgress?: (page: number, total: number) => void;
  onComplete?: (outputDataUrl: string, conversionId: string) => void;
  onError?: (error: string) => void;
}

export async function runConversion(
  file: File,
  userId: string,
  callbacks: ConversionCallbacks = {}
): Promise<void> {
  const { onStatusChange, onProgress, onComplete, onError } = callbacks;

  const fileType = detectFileType(file);

  // 1. Create Firestore record
  let conversionId: string;
  try {
    const record: Omit<Conversion, "id"> = {
      userId,
      originalFileName: file.name,
      originalFileSize: file.size,
      fileType,
      status: "pending",
      createdAt: Date.now(),
    };
    const docRef = await addDoc(collection(db, "conversions"), {
      ...record,
      createdAtServer: serverTimestamp(),
    });
    conversionId = docRef.id;
  } catch (e) {
    const msg = "Failed to create conversion record. Check your connection.";
    onError?.(msg);
    return;
  }

  // Helper to update Firestore status
  async function updateStatus(
    status: ConversionStatus,
    extra: Partial<Conversion> = {}
  ) {
    onStatusChange?.(status);
    try {
      await updateDoc(doc(db, "conversions", conversionId), {
        status,
        ...extra,
        ...(status === "completed" || status === "failed"
          ? { completedAt: Date.now() }
          : {}),
      });
    } catch {
      // Non-fatal: status update failed but conversion can still proceed
      console.warn("Firestore status update failed:", status);
    }
  }

  try {
    await updateStatus("processing");

    // 2. Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 3. Run appropriate converter
    let outputBytes: Uint8Array;
    let outputMimeType: string;
    let pageCount: number | undefined;

    if (fileType === "pdf") {
      const { convertPdfToDarkMode } = await import("@/lib/pdf-converter");
      outputBytes = await convertPdfToDarkMode(arrayBuffer, (page, total) => {
        pageCount = total;
        onProgress?.(page, total);
      });
      outputMimeType = "application/pdf";
    } else {
      const { convertPptxToDarkMode } = await import("@/lib/pptx-converter");
      outputBytes = await convertPptxToDarkMode(
        arrayBuffer,
        (slide, total) => {
          pageCount = total;
          onProgress?.(slide, total);
        }
      );
      outputMimeType =
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    }

    // 4. Convert to data URL for download
    // For large outputs we keep it in memory only (not stored in Firestore)
    // Slice to a plain ArrayBuffer to satisfy Blob's BlobPart type constraint
    const outputBuffer = outputBytes.buffer.slice(
      outputBytes.byteOffset,
      outputBytes.byteOffset + outputBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([outputBuffer], { type: outputMimeType });
    const outputDataUrl = URL.createObjectURL(blob);

    // Store minimal metadata in Firestore (not the binary — too large)
    await updateStatus("completed", {
      pageCount,
      // Store a flag so the dashboard knows it's ready for download
      outputDownloadUrl: "client-blob:" + conversionId,
    });

    onComplete?.(outputDataUrl, conversionId);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Conversion failed unexpectedly.";
    console.error("Conversion error:", error);
    await updateStatus("failed", { errorMessage: msg });
    onError?.(msg);
  }
}
