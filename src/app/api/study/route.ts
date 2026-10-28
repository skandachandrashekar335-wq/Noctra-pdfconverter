import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { authenticateRequest } from "@/lib/server/history-handlers";
import {
  createStudyProvider,
  StudyInputError,
  StudyProviderUnavailableError,
  studyConfigMessage,
  validateStudyRequest,
} from "@/lib/ai-study";

const requests = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

function limited(uid: string): boolean {
  const now = Date.now();
  const recent = (requests.get(uid) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    requests.set(uid, recent);
    return true;
  }
  recent.push(now);
  requests.set(uid, recent);
  return false;
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, { verifyToken: verifyIdToken });
  if (auth instanceof NextResponse) return auth;
  if (limited(auth.uid)) return NextResponse.json({ error: "Study assistant rate limit reached. Try again shortly.", code: "study/rate-limited" }, { status: 429 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Request body must be valid JSON.", code: "request/invalid" }, { status: 400 }); }
  if (body.consent !== true) return NextResponse.json({ error: "Explicit consent is required before document text is sent to the configured study provider.", code: "study/consent-required" }, { status: 400 });
  try {
    const input = validateStudyRequest(body);
    const provider = createStudyProvider();
    if (!provider) throw new StudyProviderUnavailableError();
    return NextResponse.json(await provider.generate(input));
  } catch (error) {
    if (error instanceof StudyInputError) return NextResponse.json({ error: error.message, code: "request/invalid" }, { status: 400 });
    if (error instanceof StudyProviderUnavailableError) return NextResponse.json({ error: studyConfigMessage(), code: "study/not-configured" }, { status: 503 });
    console.error("Noctra study provider failure", { code: "study/provider-error" });
    return NextResponse.json({ error: "The study provider could not complete this request.", code: "study/provider-error" }, { status: 502 });
  }
}
