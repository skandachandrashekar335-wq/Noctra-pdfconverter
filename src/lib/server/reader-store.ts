import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";
import type { ReaderAnnotation, ReaderPreferences, ReaderTheme } from "@/types";

function client() {
  const config = readSupabaseServerConfig();
  if (!config) throw new Error("Reader storage is not configured.");
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapPreferences(row: Record<string, unknown>): ReaderPreferences {
  return {
    documentKey: String(row.document_key),
    pageNumber: Number(row.page_number),
    zoom: Number(row.zoom),
    theme: row.theme === "sepia" || row.theme === "paper" ? row.theme : "night",
    updatedAt: Date.parse(String(row.updated_at)) || 0,
  };
}

function mapAnnotation(row: Record<string, unknown>): ReaderAnnotation {
  return {
    id: String(row.id),
    userId: String(row.user_uid),
    documentKey: String(row.document_key),
    pageNumber: Number(row.page_number),
    kind: row.kind === "note" || row.kind === "highlight" ? row.kind : "bookmark",
    ...(typeof row.quote === "string" ? { quote: row.quote } : {}),
    ...(typeof row.note === "string" ? { note: row.note } : {}),
    ...(Array.isArray(row.rects) ? { rects: row.rects as ReaderAnnotation["rects"] } : {}),
    ...(typeof row.color === "string" ? { color: row.color } : {}),
    createdAt: Date.parse(String(row.created_at)) || 0,
    updatedAt: Date.parse(String(row.updated_at)) || 0,
  };
}

export async function getReaderState(uid: string, documentKey: string) {
  const supabase = client();
  const [preferences, annotations] = await Promise.all([
    supabase.from("reader_preferences").select("*").eq("user_uid", uid).eq("document_key", documentKey).maybeSingle(),
    supabase.from("reader_annotations").select("*").eq("user_uid", uid).eq("document_key", documentKey).order("page_number").order("created_at"),
  ]);
  if (preferences.error) throw preferences.error;
  if (annotations.error) throw annotations.error;
  return {
    preferences: preferences.data ? mapPreferences(preferences.data as Record<string, unknown>) : null,
    annotations: (annotations.data ?? []).map((row) => mapAnnotation(row as Record<string, unknown>)),
  };
}

export async function upsertReaderPreferences(uid: string, input: {
  documentKey: string;
  pageNumber: number;
  zoom: number;
  theme: ReaderTheme;
}) {
  const { data, error } = await client()
    .from("reader_preferences")
    .upsert({ user_uid: uid, document_key: input.documentKey, page_number: input.pageNumber, zoom: input.zoom, theme: input.theme, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return mapPreferences(data as Record<string, unknown>);
}

export async function createReaderAnnotation(uid: string, input: Omit<ReaderAnnotation, "id" | "userId" | "createdAt" | "updatedAt">) {
  const { data, error } = await client()
    .from("reader_annotations")
    .insert({ user_uid: uid, document_key: input.documentKey, page_number: input.pageNumber, kind: input.kind, quote: input.quote ?? null, note: input.note ?? null, rects: input.rects ?? null, color: input.color ?? null })
    .select("*")
    .single();
  if (error) throw error;
  return mapAnnotation(data as Record<string, unknown>);
}

export async function deleteReaderAnnotation(uid: string, id: string) {
  const { data, error } = await client().from("reader_annotations").delete().eq("id", id).eq("user_uid", uid).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
