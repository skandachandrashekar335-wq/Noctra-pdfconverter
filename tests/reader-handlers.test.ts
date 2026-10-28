import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const { handleReaderGet, handleReaderWrite, handleReaderDelete } = await import(
  "../src/lib/server/reader-handlers.ts"
);

function request(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const documentKey = "a".repeat(64);

describe("reader metadata authorization", () => {
  test("rejects malformed document identities before storage", async () => {
    let called = false;
    const response = await handleReaderGet(request("/api/reader?documentKey=bad", { token: "alice" }), {
      verifyToken: async () => "alice-uid",
      state: async () => { called = true; return {}; },
      savePreferences: async () => ({}),
      createAnnotation: async () => ({}),
      deleteAnnotation: async () => false,
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  });

  test("derives the owner from the verified token for writes and deletes", async () => {
    const calls: string[] = [];
    const handlers = {
      verifyToken: async () => "alice-uid",
      state: async (uid: string) => ({ uid }),
      savePreferences: async (uid: string) => { calls.push(`pref:${uid}`); return {}; },
      createAnnotation: async (uid: string) => { calls.push(`annotation:${uid}`); return {}; },
      deleteAnnotation: async (uid: string) => { calls.push(`delete:${uid}`); return true; },
    };
    const pref = await handleReaderWrite(request("/api/reader", {
      method: "PUT", token: "alice", body: { type: "preferences", documentKey, pageNumber: 2, zoom: 1, theme: "night", user_uid: "bob-uid" },
    }), handlers);
    assert.equal(pref.status, 200);
    const annotation = await handleReaderWrite(request("/api/reader", {
      method: "POST", token: "alice", body: { documentKey, pageNumber: 2, kind: "note", note: "Private note", user_uid: "bob-uid" },
    }), handlers);
    assert.equal(annotation.status, 201);
    const deleted = await handleReaderDelete(request("/api/reader/annotation-1", { method: "DELETE", token: "alice" }), handlers, "annotation-1");
    assert.equal(deleted.status, 204);
    assert.deepEqual(calls, ["pref:alice-uid", "annotation:alice-uid", "delete:alice-uid"]);
  });

  test("requires real highlight content instead of accepting a decorative marker", async () => {
    const response = await handleReaderWrite(request("/api/reader", {
      method: "POST", token: "alice", body: { documentKey, pageNumber: 1, kind: "highlight", quote: "", rects: [] },
    }), {
      verifyToken: async () => "alice-uid",
      state: async () => ({}),
      savePreferences: async () => ({}),
      createAnnotation: async () => ({}),
      deleteAnnotation: async () => false,
    });
    assert.equal(response.status, 400);
  });
});
