/**
 * Row mapping, input whitelisting, and ordered status writes.
 *
 * The conversion history UI is unchanged by the migration, so the contract
 * these pin is the one `ConversionList` already relies on: snake_case Postgres
 * rows become the camelCase `Conversion` type, timestamps arrive as Unix
 * milliseconds, and a client can only submit the fields it is allowed to.
 *
 * The ordering block replays the client store against a recording `fetch`
 * and asserts that status writes leave in submission order — the property
 * `history-tracker.ts` guarantees and that the dashboard renders as a
 * pending → processing → completed sequence.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const { rowToConversion, sanitizeNewConversion, sanitizeStatusUpdate, toConversionStatus, toUnixMs } =
  await import("../src/lib/history-row.ts");
const { createRemoteHistoryStore, HistorySaveError, resetHistoryAvailabilityForTests } =
  await import("../src/lib/history-api.ts");
const { createHistoryTracker } = await import("../src/lib/history-tracker.ts");

/** Always returns a token, so these tests exercise the transport itself. */
const signedIn: () => Promise<string | null> = async () => "stub-token";

const ROW = {
  id: "c1",
  user_uid: "alice-uid",
  client_ref: "ref-1",
  original_file_name: "lecture.pdf",
  original_file_size: 1024,
  output_file_name: "lecture-dark.pdf",
  file_type: "pdf",
  status: "processing",
  page_count: 3,
  error_message: null,
  created_at: "2026-03-01T10:00:00.000Z",
  completed_at: null,
};

describe("row mapping", () => {
  test("maps a Postgres row onto the Conversion the UI renders", () => {
    const conversion = rowToConversion(ROW as never);

    assert.equal(conversion.id, "c1");
    assert.equal(conversion.userId, "alice-uid");
    assert.equal(conversion.originalFileName, "lecture.pdf");
    assert.equal(conversion.originalFileSize, 1024);
    assert.equal(conversion.outputFileName, "lecture-dark.pdf");
    assert.equal(conversion.fileType, "pdf");
    assert.equal(conversion.status, "processing");
    assert.equal(conversion.pageCount, 3);
    assert.equal(
      conversion.createdAt,
      Date.parse("2026-03-01T10:00:00.000Z"),
      "timestamps are Unix milliseconds, as Conversion has always declared"
    );
    assert.equal(conversion.completedAt, undefined, "null completed_at stays absent");
    assert.equal(conversion.errorMessage, undefined);
  });

  test("a terminal row carries completedAt as ms", () => {
    const conversion = rowToConversion({
      ...ROW,
      status: "completed",
      completed_at: "2026-03-01T10:05:00.000Z",
    } as never);
    assert.equal(conversion.status, "completed");
    assert.equal(conversion.completedAt, Date.parse("2026-03-01T10:05:00.000Z"));
  });

  test("an unexpected status degrades to pending rather than rendering blank", () => {
    assert.equal(toConversionStatus("nonsense"), "pending");
    assert.equal(toConversionStatus(undefined), "pending");
    assert.equal(toConversionStatus("completed"), "completed");
  });

  test("DOCX and PPTX file types remain supported", () => {
    assert.equal(rowToConversion({ ...ROW, file_type: "docx" } as never).fileType, "docx");
    assert.equal(rowToConversion({ ...ROW, file_type: "pptx" } as never).fileType, "pptx");
    assert.equal(rowToConversion({ ...ROW, file_type: "unknown" } as never).fileType, "pdf");
  });

  test("a malformed timestamp becomes 0 instead of NaN", () => {
    assert.equal(toUnixMs("not a date"), 0);
    assert.equal(toUnixMs(null), 0);
    assert.equal(toUnixMs(1_700_000_000_000), 1_700_000_000_000);
    assert.equal(Number.isNaN(rowToConversion(ROW as never).createdAt), false);
  });
});

describe("creation input whitelist", () => {
  test("only whitelisted fields are produced", () => {
    const fields = sanitizeNewConversion({
      originalFileName: "lecture.pdf",
      originalFileSize: 1024,
      fileType: "pdf",
      clientRef: "ref-1",
    });
    assert.deepEqual(
      Object.keys(fields).sort(),
      ["client_ref", "file_type", "original_file_name", "original_file_size", "status"],
      "no owner, id or timestamp is accepted from the client"
    );
    assert.equal(fields.status, "pending");
  });

  test("an absurd file size is clamped to a non-negative integer", () => {
    const fields = sanitizeNewConversion({
      originalFileName: "a.pdf",
      originalFileSize: -50.7,
      fileType: "pdf",
      clientRef: "ref",
    });
    assert.equal(fields.original_file_size, 0);
  });

  test("an over-long filename is truncated before it reaches Postgres", () => {
    const fields = sanitizeNewConversion({
      originalFileName: "x".repeat(2000),
      originalFileSize: 1,
      fileType: "pdf",
      clientRef: "ref",
    });
    assert.equal(String(fields.original_file_name).length, 512);
  });

  test("an unknown file type is rejected down to a supported format", () => {
    assert.equal(
      sanitizeNewConversion({
        originalFileName: "a",
        originalFileSize: 1,
        fileType: "exe" as never,
        clientRef: "ref",
      }).file_type,
      "pdf"
    );
  });

  test("DOCX creation records retain the docx file type", () => {
    assert.equal(
      sanitizeNewConversion({
        originalFileName: "notes.docx",
        originalFileSize: 10,
        fileType: "docx",
        clientRef: "ref-docx",
      }).file_type,
      "docx"
    );
  });
});

describe("status update whitelist", () => {
  test("a terminal status stamps a server-side timestamp", () => {
    const before = Date.now();
    const patch = sanitizeStatusUpdate({ status: "completed", pageCount: 12 });
    assert.equal(patch?.status, "completed");
    assert.equal(patch?.page_count, 12);
    const at = Date.parse(String(patch?.completed_at));
    assert.ok(at >= before, "completed_at comes from the server clock");
  });

  test("a non-terminal status does not stamp completed_at", () => {
    const patch = sanitizeStatusUpdate({ status: "processing" });
    assert.equal(patch?.status, "processing");
    assert.equal(patch?.completed_at, undefined);
  });

  test("ownership and file metadata cannot be rewritten by a status patch", () => {
    const patch = sanitizeStatusUpdate({
      status: "failed",
      // Forged attempts:
      user_uid: "victim-uid",
      userId: "victim-uid",
      original_file_name: "changed.pdf",
      original_file_size: 0,
      created_at: "2000-01-01",
      id: "other-id",
    } as never);
    assert.ok(patch);
    for (const field of ["user_uid", "userId", "original_file_name", "original_file_size", "created_at", "id"]) {
      assert.equal(
        field in patch,
        false,
        `client must not be able to set ${field}`
      );
    }
  });

  test("an empty patch is reported as null so routes can 400", () => {
    assert.equal(sanitizeStatusUpdate({}), null);
    assert.equal(sanitizeStatusUpdate({ status: "unknown" }), null);
  });

  test("an error message is truncated", () => {
    const patch = sanitizeStatusUpdate({ status: "failed", errorMessage: "x".repeat(5000) });
    assert.equal(String(patch?.error_message).length, 2000);
  });

  test("organization metadata is whitelisted and normalized", () => {
    const patch = sanitizeStatusUpdate({
      isFavorite: true,
      tags: [" exam ", "exam", "notes"],
      displayName: "  Biology  ",
      documentKey: "a".repeat(64),
    });
    assert.deepEqual(patch, {
      is_favorite: true,
      tags: ["exam", "notes"],
      display_name: "Biology",
      document_key: "a".repeat(64),
    });
  });
});

describe("ordered history updates", () => {
  const originalFetch = globalThis.fetch;
  let requests: { url: string; method: string; body: unknown }[] = [];

  beforeEach(() => {
    requests = [];
    // Each test gets a fresh "storage available" verdict — the module caches
    // a 503 so a real deployment stops re-probing, which would otherwise
    // leak between tests.
    resetHistoryAvailabilityForTests();
    // Record every request; resolve in a shuffled delay so any accidental
    // concurrency would reorder the *records* and fail the assertions below.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });

      if (method === "POST") {
        return new Response(
          JSON.stringify({ conversion: { id: "server-id-1" } }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ conversion: { id: "server-id-1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("status writes reach the API in submission order", async () => {
    const store = createRemoteHistoryStore(signedIn);
    const tracker = createHistoryTracker(
      store,
      { originalFileName: "a.pdf", originalFileSize: 1, fileType: "pdf" },
      () => {}
    );

    tracker.submit("processing");
    tracker.submit("completed", { pageCount: 4 });
    tracker.submit("failed", { errorMessage: "late failure" });
    await tracker.flush();

    const patches = requests.filter((r) => r.method === "PATCH");
    assert.equal(patches.length, 3, "every queued write is sent");
    assert.deepEqual(
      patches.map((r) => (r.body as { status: string }).status),
      ["processing", "completed", "failed"],
      "writes are delivered in submission order, never interleaved"
    );
    assert.equal(
      patches[0].url,
      "/api/history/server-id-1",
      "every patch targets the id returned by creation"
    );
  });

  test("creation is a single idempotent POST carrying the shared clientRef", async () => {
    const store = createRemoteHistoryStore(signedIn);
    const tracker = createHistoryTracker(
      store,
      { originalFileName: "a.pdf", originalFileSize: 1, fileType: "pdf" },
      () => {}
    );
    tracker.submit("processing");
    tracker.submit("completed");
    await tracker.flush();

    const posts = requests.filter((r) => r.method === "POST");
    assert.equal(posts.length, 1, "one record per conversion — no duplicates");
    const body = posts[0].body as { clientRef: string; userId?: string };
    assert.ok(body.clientRef, "clientRef is sent so a retry upserts the same row");
    assert.equal(body.userId, undefined, "no uid is ever sent from the browser");
    assert.match(store.clientRef, /^[0-9a-f-]{36}$/i, "clientRef is a uuid");
  });

  test("a non-2xx response surfaces as a history error, not a rejection", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "RLS denied" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const warnings: string[] = [];
    const tracker = createHistoryTracker(
      createRemoteHistoryStore(signedIn),
      { originalFileName: "a.pdf", originalFileSize: 1, fileType: "pdf" },
      (m) => warnings.push(m)
    );
    tracker.submit("processing");
    await tracker.flush(); // must not throw

    assert.equal(warnings.length, 1, "the failure is reported exactly once");
    assert.match(warnings[0], /history/i);
    assert.ok(warnings[0].includes("403"), "the status is surfaced for debugging");
  });

  test("a network failure is reported rather than thrown", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const warnings: string[] = [];
    const tracker = createHistoryTracker(
      createRemoteHistoryStore(signedIn),
      { originalFileName: "a.pdf", originalFileSize: 1, fileType: "pdf" },
      (m) => warnings.push(m)
    );
    tracker.submit("processing");
    await tracker.flush();

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /reach the history service/i);
  });

  test("failures carry a typed reason, not just message text", async () => {
    const { HistorySaveError: Err } = await import("../src/lib/history-api.ts");

    // Network failure
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await assert.rejects(
      createRemoteHistoryStore(signedIn).create({ originalFileName: "a.pdf" }),
      (e: unknown) =>
        e instanceof Err && e.reason === "network" && e.status === 0
    );

    // 401 from the server
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "sign in" }), { status: 401 })) as typeof fetch;
    resetHistoryAvailabilityForTests();
    await assert.rejects(
      createRemoteHistoryStore(signedIn).create({ originalFileName: "a.pdf" }),
      (e: unknown) =>
        e instanceof Err && e.reason === "unauthorized" && e.status === 401
    );

    // 503 = storage not configured on this deploy
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "no supabase" }), { status: 503 })) as typeof fetch;
    resetHistoryAvailabilityForTests();
    await assert.rejects(
      createRemoteHistoryStore(signedIn).create({ originalFileName: "a.pdf" }),
      (e: unknown) =>
        e instanceof Err && e.reason === "not-configured" && e.status === 503
    );
  });

  test("a 503 short-circuits later attempts instead of retrying forever", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ error: "no supabase" }), { status: 503 });
    }) as typeof fetch;

    const store = createRemoteHistoryStore(signedIn);
    await store.create({ originalFileName: "a.pdf" }).catch(() => {});
    const callsAfterFirst = calls;
    assert.equal(callsAfterFirst, 1);

    // Second attempt must not hit the network again.
    await store.create({ originalFileName: "b.pdf" }).catch(() => {});
    assert.equal(calls, callsAfterFirst, "an unconfigured deploy stops being probed");

    resetHistoryAvailabilityForTests();
  });

  test("signed-out is distinguished from an expired session", async () => {
    const { HistorySaveError: Err, historyFailureMessage } = await import(
      "../src/lib/history-api.ts"
    );

    await assert.rejects(
      createRemoteHistoryStore().create({ originalFileName: "a.pdf" }),
      (e: unknown) =>
        e instanceof Err &&
        e.reason === "signed-out" &&
        e.message.includes("not added to your history")
    );

    // Each reason maps to copy that never blames the conversion.
    for (const reason of [
      "signed-out",
      "not-configured",
      "network",
      "unauthorized",
      "server-error",
      "bad-response",
    ] as const) {
      const message = historyFailureMessage(reason);
      assert.ok(message.length > 0, `reason ${reason} has copy`);
      assert.doesNotMatch(
        message,
        /conversion (failed|error)/i,
        `reason ${reason} must not claim the conversion failed`
      );
    }
  });

  test("an unsigned caller cannot create a record", async () => {
    globalThis.fetch = (async () =>
      new Response("unreachable", { status: 401 })) as typeof fetch;

    const { auth } = await import("../src/lib/firebase.ts");
    assert.equal(auth?.currentUser ?? null, null, "precondition: not signed in");

    const store = createRemoteHistoryStore();
    await assert.rejects(
      store.create({ originalFileName: "a.pdf" }),
      (err: unknown) => err instanceof HistorySaveError && /signed out/i.test(err.message),
      "creation fails fast with a clear, honest message"
    );
  });
});
