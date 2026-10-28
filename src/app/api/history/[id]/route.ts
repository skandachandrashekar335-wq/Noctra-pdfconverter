// PATCH /api/history/[id] — update a history record the caller owns.
//
// Ownership is enforced in the query itself (`eq user_uid`), so patching a
// record that belongs to someone else returns 404 — indistinguishable from a
// record that does not exist, which avoids leaking the existence of other
// users' rows.
//
// Runs on the default Node.js runtime; `runtime` cannot be exported alongside
// `cacheComponents`, and nothing here is edge-compatible anyway.

import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { deleteConversion, updateConversion } from "@/lib/server/history-store";
import {
  handleDelete,
  handleUpdate,
  type HistoryHandlers,
} from "@/lib/server/history-handlers";

const handlers: HistoryHandlers = {
  verifyToken: verifyIdToken,
  // Not reachable from this route; required to satisfy the shared contract.
  list: async () => [],
  create: async () => {
    throw new Error("create() is not reachable from PATCH /api/history/[id]");
  },
  update: updateConversion,
  remove: deleteConversion,
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleUpdate(request, handlers, id);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDelete(request, handlers, id);
}
