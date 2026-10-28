/**
 * Security contract for the Supabase history API.
 *
 * These tests pin the four properties the migration must not regress:
 *   1. A verified Firebase token grants access to *that* user's records only.
 *   2. A different user's records are unreachable — reads and writes alike.
 *   3. Missing, malformed, invalid and expired tokens are rejected.
 *   4. A uid smuggled into the request body is ignored (never trusted).
 *
 * Everything runs against injected handlers, so no network, no Supabase
 * project and no live Firebase credentials are involved — and none are
 * faked either: `verifyToken` is a stub that either returns a uid or throws
 * with the same `auth/*` codes the Admin SDK uses, which is exactly what
 * `classifyTokenError` matches on.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const { handleList, handleCreate, handleUpdate, handleDelete } = await import(
  "../src/lib/server/history-handlers.ts"
);
const { sanitizeStatusUpdate } = await import("../src/lib/history-row.ts");

/** Stand-in for `verifyIdToken`: returns the uid, or throws like the SDK. */
function verifier(map: Record<string, string | Error>) {
  return async (token: string): Promise<string> => {
    const result = map[token];
    if (result instanceof Error) throw result;
    if (result === undefined) {
      const err = new Error("Decoding Firebase ID token failed.");
      (err as { code?: string }).code = "auth/argument-error";
      throw err;
    }
    return result;
  };
}

function authError(code: string): Error {
  const err = new Error(`Firebase ID token error: ${code}`);
  (err as { code?: string }).code = code;
  return err;
}

/**
 * In-memory stand-in for the Supabase store, honouring the same two rules the
 * real store implements: operations are scoped by uid (so a caller can only
 * reach rows it owns) and status patches go through the production
 * `sanitizeStatusUpdate`, so the field mapping under test is the real one.
 */
function fakeStore() {
  const rows = new Map<string, Record<string, unknown>>();

  return {
    rows,
    async list(uid: string) {
      return [...rows.values()]
        .filter((r) => r.user_uid === uid)
        .sort((a, b) => Number(b.created_at) - Number(a.created_at));
    },
    async create(
      uid: string,
      input: { clientRef: string; originalFileName: string }
    ) {
      const id = `${uid}:${input.clientRef}`;
      const row = {
        id,
        user_uid: uid, // stamped from the verified uid, never the body
        client_ref: input.clientRef,
        original_file_name: input.originalFileName,
        created_at: Date.now(),
        status: "pending",
      };
      rows.set(id, row);
      return row;
    },
    async update(uid: string, id: string, patch: Record<string, unknown>) {
      const row = rows.get(id);
      // Scoped by uid: another user's row is simply not found.
      if (!row || row.user_uid !== uid) return null;
      const fields = sanitizeStatusUpdate(patch);
      if (fields) Object.assign(row, fields);
      return row;
    },
  };
}

function req(
  path: string,
  init: { method?: string; token?: string | null; body?: unknown } = {}
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined
      ? {}
      : { body: JSON.stringify(init.body) }),
  });
}

const TOKENS = {
  alice: "tok-alice",
  bob: "tok-bob",
  expired: "tok-expired",
  revoked: "tok-revoked",
  unknown: "tok-unknown",
};

const handlersFor = (store: ReturnType<typeof fakeStore>) => ({
  verifyToken: verifier({
    [TOKENS.alice]: "alice-uid",
    [TOKENS.bob]: "bob-uid",
    [TOKENS.expired]: authError("auth/id-token-expired"),
    [TOKENS.revoked]: authError("auth/id-token-revoked"),
    [TOKENS.unknown]: authError("auth/argument-error"),
  } as Record<string, string | Error>),
  list: store.list,
  create: store.create,
  update: store.update,
});

describe("authenticated history access", () => {
  test("a verified token returns only that user's records", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);

    await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.alice,
        body: {
          originalFileName: "a.pdf",
          originalFileSize: 10,
          fileType: "pdf",
          clientRef: "ref-1",
        },
      }),
      handlers
    );
    await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.bob,
        body: {
          originalFileName: "b.pdf",
          originalFileSize: 20,
          fileType: "pdf",
          clientRef: "ref-2",
        },
      }),
      handlers
    );

    const response = await handleList(req("/api/history", { token: TOKENS.alice }), handlers);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { conversions: { original_file_name: string; user_uid: string }[] };

    assert.equal(body.conversions.length, 1, "only Alice's rows are returned");
    assert.equal(body.conversions[0].original_file_name, "a.pdf");
    assert.equal(
      body.conversions[0].user_uid,
      "alice-uid",
      "the row is owned by the verified uid"
    );
  });

  test("creation stamps the verified uid, not anything from the body", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);

    const response = await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.alice,
        body: {
          originalFileName: "a.pdf",
          originalFileSize: 10,
          fileType: "pdf",
          clientRef: "ref-1",
          // Attempted forgery: claim the record belongs to Bob.
          user_uid: "bob-uid",
          userId: "bob-uid",
        },
      }),
      handlers
    );

    assert.equal(response.status, 201);
    const created = [...store.rows.values()][0];
    assert.equal(
      created.user_uid,
      "alice-uid",
      "a client-supplied uid must be ignored — the token is the identity"
    );
  });
});

describe("cross-user access denial", () => {
  test("Bob cannot read Alice's records", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);

    await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.alice,
        body: {
          originalFileName: "secret.pdf",
          originalFileSize: 1,
          fileType: "pdf",
          clientRef: "ref-1",
        },
      }),
      handlers
    );

    const response = await handleList(req("/api/history", { token: TOKENS.bob }), handlers);
    const body = (await response.json()) as { conversions: unknown[] };
    assert.equal(body.conversions.length, 0, "Bob sees an empty list");
  });

  test("Bob cannot patch Alice's record — it reads as not found", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);

    const created = await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.alice,
        body: {
          originalFileName: "secret.pdf",
          originalFileSize: 1,
          fileType: "pdf",
          clientRef: "ref-1",
        },
      }),
      handlers
    );
    const { conversion } = (await created.json()) as { conversion: { id: string } };

    const response = await handleUpdate(
      req(`/api/history/${conversion.id}`, {
        method: "PATCH",
        token: TOKENS.bob,
        body: { status: "failed", errorMessage: "tampered" },
      }),
      handlers,
      conversion.id
    );

    assert.equal(
      response.status,
      404,
      "404 rather than 403, so existence is not leaked"
    );

    // Alice's row is untouched.
    const row = store.rows.get(conversion.id);
    assert.notEqual(row?.status, "failed", "the victim's record was not modified");
  });

  test("Alice's own record updates normally", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);

    const created = await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.alice,
        body: {
          originalFileName: "a.pdf",
          originalFileSize: 1,
          fileType: "pdf",
          clientRef: "ref-1",
        },
      }),
      handlers
    );
    const { conversion } = (await created.json()) as { conversion: { id: string } };

    const response = await handleUpdate(
      req(`/api/history/${conversion.id}`, {
        method: "PATCH",
        token: TOKENS.alice,
        body: { status: "completed", pageCount: 12 },
      }),
      handlers,
      conversion.id
    );

    assert.equal(response.status, 200);
    const updated = store.rows.get(conversion.id);
    assert.equal(updated?.status, "completed");
    assert.equal(updated?.page_count, 12);
    assert.ok(updated?.completed_at, "a terminal status records a timestamp");
  });

  test("Bob cannot delete Alice's record, while Alice can delete it", async () => {
    const store = fakeStore();
    const handlers = { ...handlersFor(store), remove: async (uid: string, id: string) => {
      const row = store.rows.get(id);
      if (!row || row.user_uid !== uid) return false;
      store.rows.delete(id);
      return true;
    } };
    const created = await handleCreate(req("/api/history", {
      method: "POST", token: TOKENS.alice,
      body: { originalFileName: "secret.pdf", originalFileSize: 1, fileType: "pdf", clientRef: "ref-1" },
    }), handlers);
    const { conversion } = await created.json() as { conversion: { id: string } };

    const denied = await handleDelete(req(`/api/history/${conversion.id}`, {
      method: "DELETE", token: TOKENS.bob,
    }), handlers, conversion.id);
    assert.equal(denied.status, 404);
    assert.equal(store.rows.has(conversion.id), true);

    const removed = await handleDelete(req(`/api/history/${conversion.id}`, {
      method: "DELETE", token: TOKENS.alice,
    }), handlers, conversion.id);
    assert.equal(removed.status, 204);
    assert.equal(store.rows.has(conversion.id), false);
  });
});

describe("invalid or expired Firebase tokens", () => {
  test("a request with no Authorization header is rejected", async () => {
    const store = fakeStore();
    const response = await handleList(req("/api/history"), handlersFor(store));
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: string; code: string };
    assert.match(body.error, /sign in/i);
    assert.equal(body.code, "auth/missing-token");
  });

  test("a malformed Authorization header is rejected", async () => {
    const store = fakeStore();
    const response = await handleList(
      new NextRequest("http://localhost/api/history", {
        headers: { authorization: "Token abc.def.ghi" },
      }),
      handlersFor(store)
    );
    assert.equal(response.status, 401);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      "auth/malformed-header"
    );
  });

  test("an expired token is rejected with a re-sign-in prompt", async () => {
    const store = fakeStore();
    const response = await handleList(
      req("/api/history", { token: TOKENS.expired }),
      handlersFor(store)
    );
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "auth/expired-token");
    assert.match(body.error, /expired/i);
  });

  test("a revoked token is rejected", async () => {
    const store = fakeStore();
    const response = await handleList(
      req("/api/history", { token: TOKENS.revoked }),
      handlersFor(store)
    );
    assert.equal(response.status, 401);
    assert.equal(
      ((await response.json()) as { code: string }).code,
      "auth/invalid-token"
    );
  });

  test("an unknown token is rejected", async () => {
    const store = fakeStore();
    const response = await handleList(
      req("/api/history", { token: "tok-unknown" }),
      handlersFor(store)
    );
    assert.equal(response.status, 401);
  });

  test("rejection happens before any store call", async () => {
    const store = fakeStore();
    let called = false;
    const handlers = {
      ...handlersFor(store),
      list: async (uid: string) => {
        called = true;
        return store.list(uid);
      },
    };
    await handleList(req("/api/history", { token: TOKENS.expired }), handlers);
    assert.equal(called, false, "an unverified caller must never reach storage");
  });

  test("verification infrastructure failure is a 503, not a 401", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);
    handlers.verifyToken = async () => {
      throw new Error("Failed to determine service account");
    };
    const response = await handleList(req("/api/history", { token: TOKENS.alice }), handlers);
    assert.equal(
      response.status,
      503,
      "a server-side outage must not tell the user their session is bad"
    );
  });

  test("Firebase credential/configuration failures are a sanitized 503", async () => {
    const store = fakeStore();
    const handlers = handlersFor(store);
    handlers.verifyToken = async () => {
      throw new Error("Failed to determine service account: private key contents omitted");
    };
    const response = await handleList(req("/api/history", { token: TOKENS.alice }), handlers);
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error: string; code: string };
    assert.equal(body.code, "auth/configuration-error");
    assert.doesNotMatch(body.error, /private key|service account/i);
    assert.match(body.error, /conversions still work/i);
  });

  test("history list rejects invalid limits instead of silently clamping them", async () => {
    const store = fakeStore();
    for (const value of ["999", "1.5", "10abc"]) {
      const response = await handleList(
        req(`/api/history?limit=${value}`, { token: TOKENS.alice }),
        handlersFor(store)
      );
      assert.equal(response.status, 400, `limit=${value} must be rejected`);
    }
  });
});

describe("request validation", () => {
  test("a record missing required fields is a 400", async () => {
    const store = fakeStore();
    const response = await handleCreate(
      req("/api/history", {
        method: "POST",
        token: TOKENS.alice,
        body: { originalFileName: "", originalFileSize: -1, fileType: "exe" },
      }),
      handlersFor(store)
    );
    assert.equal(response.status, 400);
    assert.equal(store.rows.size, 0, "nothing was written");
  });

  test("a non-JSON body is a 400", async () => {
    const store = fakeStore();
    const response = await handleCreate(
      new NextRequest("http://localhost/api/history", {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKENS.alice}`,
          "content-type": "application/json",
        },
        body: "not json",
      }),
      handlersFor(store)
    );
    assert.equal(response.status, 400);
  });

  test("an empty patch is a 400 rather than a silent no-op", async () => {
    const store = fakeStore();
    const response = await handleUpdate(
      req("/api/history/some-id", {
        method: "PATCH",
        token: TOKENS.alice,
        body: {},
      }),
      handlersFor(store),
      "some-id"
    );
    assert.equal(response.status, 400);
  });
});
