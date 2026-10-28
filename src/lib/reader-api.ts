import { auth } from "@/lib/firebase";
import type {
  ReaderAnnotation,
  ReaderPreferences,
  ReaderTheme,
} from "@/types";
import type { StudyTask } from "@/lib/ai-study";

async function token(): Promise<string> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Sign in to save reader changes.");
  return user.getIdToken();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await token()}`,
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Reader storage is unavailable.");
  return body;
}

export async function fetchReaderState(documentKey: string): Promise<{
  preferences: ReaderPreferences | null;
  annotations: ReaderAnnotation[];
}> {
  return request(`/api/reader?documentKey=${encodeURIComponent(documentKey)}`);
}

export async function saveReaderPreferences(input: {
  documentKey: string;
  pageNumber: number;
  zoom: number;
  theme: ReaderTheme;
}): Promise<ReaderPreferences> {
  const body = await request<{ preferences: ReaderPreferences }>("/api/reader", {
    method: "PUT",
    body: JSON.stringify({ type: "preferences", ...input }),
  });
  return body.preferences;
}

export async function saveReaderAnnotation(input: {
  documentKey: string;
  pageNumber: number;
  kind: ReaderAnnotation["kind"];
  quote?: string;
  note?: string;
  rects?: ReaderAnnotation["rects"];
  color?: string;
}): Promise<ReaderAnnotation> {
  const body = await request<{ annotation: ReaderAnnotation }>("/api/reader", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return body.annotation;
}

export async function deleteReaderAnnotation(id: string): Promise<void> {
  await request(`/api/reader/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function runStudyRequest(input: {
  documentKey: string;
  task: StudyTask;
  question?: string;
  consent: boolean;
  passages: Array<{ pageNumber: number; text: string }>;
}): Promise<{ answer: string; sourcePages: number[] }> {
  return request<{ answer: string; sourcePages: number[] }>("/api/study", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
