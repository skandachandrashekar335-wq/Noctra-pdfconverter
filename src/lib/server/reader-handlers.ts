import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, type HistoryHandlers } from "@/lib/server/history-handlers";
import type { ReaderAnnotationKind, ReaderTheme } from "@/types";

const KEY = /^[0-9a-f]{64}$/;

function invalid(message: string) {
  return NextResponse.json({ error: message, code: "request/invalid" }, { status: 400 });
}

export interface ReaderHandlers extends Pick<HistoryHandlers, "verifyToken"> {
  state(uid: string, documentKey: string): Promise<unknown>;
  savePreferences(uid: string, input: { documentKey: string; pageNumber: number; zoom: number; theme: ReaderTheme }): Promise<unknown>;
  createAnnotation(uid: string, input: { documentKey: string; pageNumber: number; kind: ReaderAnnotationKind; quote?: string; note?: string; rects?: unknown; color?: string }): Promise<unknown>;
  deleteAnnotation(uid: string, id: string): Promise<boolean>;
}

export async function handleReaderGet(request: NextRequest, handlers: ReaderHandlers) {
  const auth = await authenticateRequest(request, handlers);
  if (auth instanceof NextResponse) return auth;
  const documentKey = request.nextUrl.searchParams.get("documentKey") ?? "";
  if (!KEY.test(documentKey)) return invalid("documentKey must be a SHA-256 hex value.");
  try {
    return NextResponse.json(await handlers.state(auth.uid, documentKey));
  } catch {
    return NextResponse.json({ error: "Reader storage is unavailable.", code: "reader/unavailable" }, { status: 503 });
  }
}

export async function handleReaderWrite(request: NextRequest, handlers: ReaderHandlers) {
  const auth = await authenticateRequest(request, handlers);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return invalid("Request body must be valid JSON."); }
  const documentKey = body.documentKey;
  const pageNumber = body.pageNumber;
  if (typeof documentKey !== "string" || !KEY.test(documentKey) || typeof pageNumber !== "number" || !Number.isInteger(pageNumber) || pageNumber < 1) return invalid("A valid documentKey and pageNumber are required.");
  const page = pageNumber as number;
  try {
    if (body.type === "preferences") {
      const zoom = body.zoom;
      const theme = body.theme;
      if (typeof zoom !== "number" || zoom < 0.5 || zoom > 3 || (theme !== "night" && theme !== "sepia" && theme !== "paper")) return invalid("Reader preferences are invalid.");
      return NextResponse.json({ preferences: await handlers.savePreferences(auth.uid, { documentKey, pageNumber: page, zoom, theme }) });
    }
    const kind = body.kind;
    if (kind !== "bookmark" && kind !== "note" && kind !== "highlight") return invalid("Annotation kind is invalid.");
    if (kind === "note" && (typeof body.note !== "string" || body.note.trim().length === 0 || body.note.length > 4000)) return invalid("Notes must contain 1–4000 characters.");
    if (kind === "highlight" && (typeof body.quote !== "string" || body.quote.trim().length === 0 || body.quote.length > 1000 || !Array.isArray(body.rects) || body.rects.length === 0)) return invalid("Highlights require selected text and coordinates.");
    return NextResponse.json({ annotation: await handlers.createAnnotation(auth.uid, { documentKey, pageNumber: page, kind, quote: typeof body.quote === "string" ? body.quote.slice(0, 1000) : undefined, note: typeof body.note === "string" ? body.note.slice(0, 4000) : undefined, rects: Array.isArray(body.rects) ? body.rects : undefined, color: typeof body.color === "string" ? body.color.slice(0, 20) : undefined }) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Reader storage is unavailable.", code: "reader/unavailable" }, { status: 503 });
  }
}

export async function handleReaderDelete(request: NextRequest, handlers: ReaderHandlers, id: string) {
  const auth = await authenticateRequest(request, handlers);
  if (auth instanceof NextResponse) return auth;
  if (!id) return invalid("An annotation id is required.");
  try {
    if (!(await handlers.deleteAnnotation(auth.uid, id))) return NextResponse.json({ error: "Annotation not found.", code: "reader/not-found" }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Reader storage is unavailable.", code: "reader/unavailable" }, { status: 503 });
  }
}
