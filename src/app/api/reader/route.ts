import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { createReaderAnnotation, getReaderState, upsertReaderPreferences } from "@/lib/server/reader-store";
import { handleReaderGet, handleReaderWrite, type ReaderHandlers } from "@/lib/server/reader-handlers";

const handlers: ReaderHandlers = {
  verifyToken: verifyIdToken,
  state: getReaderState,
  savePreferences: upsertReaderPreferences,
  createAnnotation: createReaderAnnotation,
  deleteAnnotation: async () => false,
};

export async function GET(request: NextRequest) { return handleReaderGet(request, handlers); }
export async function POST(request: NextRequest) { return handleReaderWrite(request, handlers); }
export async function PUT(request: NextRequest) { return handleReaderWrite(request, handlers); }
