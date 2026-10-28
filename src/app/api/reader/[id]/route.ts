import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { deleteReaderAnnotation } from "@/lib/server/reader-store";
import { handleReaderDelete, type ReaderHandlers } from "@/lib/server/reader-handlers";

const handlers: ReaderHandlers = {
  verifyToken: verifyIdToken,
  state: async () => ({ preferences: null, annotations: [] }),
  savePreferences: async () => null,
  createAnnotation: async () => null,
  deleteAnnotation: deleteReaderAnnotation,
};

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleReaderDelete(request, handlers, (await params).id);
}
