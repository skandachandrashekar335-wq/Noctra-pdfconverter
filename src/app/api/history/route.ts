// GET  /api/history        — list the signed-in user's conversion history
// POST /api/history        — create a history record owned by the caller
//
// Identity comes from the verified Firebase ID token in the Authorization
// header. The UID is never read from the request body, so a caller cannot
// create or read another user's records by supplying a different UID.
//
// Node.js runtime: `firebase-admin` and the Supabase service-role client must
// never be bundled for the edge or the browser. `runtime` cannot be exported
// alongside `cacheComponents`, but Node is the default and this route has no
// edge-compatible dependency, so no config is needed.

import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import {
  createConversion,
  listConversions,
} from "@/lib/server/history-store";
import {
  handleCreate,
  handleList,
  type HistoryHandlers,
} from "@/lib/server/history-handlers";

const handlers: HistoryHandlers = {
  verifyToken: verifyIdToken,
  list: listConversions,
  create: createConversion,
  // Not reachable from this route; required to satisfy the shared contract.
  update: async () => null,
};

export async function GET(request: NextRequest) {
  return handleList(request, handlers);
}

export async function POST(request: NextRequest) {
  return handleCreate(request, handlers);
}
