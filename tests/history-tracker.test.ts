import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHistoryTracker } from "../src/lib/history-tracker.ts";
import type { HistoryStore } from "../src/lib/history-tracker.ts";

/** A store whose create() can be resolved/rejected manually (hanging backend). */
function manualStore() {
  let resolveCreate!: (id: string) => void;
  let rejectCreate!: (e: unknown) => void;
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let rejectNextUpdate: unknown = null;

  const store: HistoryStore = {
    create: () =>
      new Promise<string>((res, rej) => {
        resolveCreate = res;
        rejectCreate = rej;
      }),
    update: async (id, data) => {
      if (rejectNextUpdate) {
        const e = rejectNextUpdate;
        rejectNextUpdate = null;
        throw e;
      }
      updates.push({ id, data });
    },
  };
  return {
    store,
    updates,
    resolveCreate: (id: string) => resolveCreate(id),
    rejectCreate: (e: unknown) => rejectCreate(e),
    failNextUpdate: (e: unknown) => {
      rejectNextUpdate = e;
    },
  };
}

const INITIAL = { userId: "u1", originalFileName: "a.pdf", status: "pending" };

describe("createHistoryTracker — must never block the caller", () => {
  test("submit() returns synchronously even while create() hangs", async () => {
    const { store } = manualStore(); // create never settles
    const tracker = createHistoryTracker(store, INITIAL);

    let returned = false;
    tracker.submit("processing");
    tracker.submit("completed", { pageCount: 3 });
    returned = true;

    assert.equal(returned, true, "submit must not await the store");
    assert.equal(tracker.currentId(), null, "id unknown while create hangs");
    // flush() would hang too — the whole point is the caller never awaits it.
  });

  test("with no store (missing config), submit is a silent no-op", async () => {
    const warnings: string[] = [];
    const tracker = createHistoryTracker(null, INITIAL, (m) => warnings.push(m));
    tracker.submit("processing");
    await tracker.flush();
    assert.equal(tracker.currentId(), null);
    assert.deepEqual(warnings, [], "no warning for the null-store path");
  });
});

describe("createHistoryTracker — queued writes flush in order", () => {
  test("writes submitted before creation land after the id is known", async () => {
    const { store, updates, resolveCreate } = manualStore();
    const tracker = createHistoryTracker(store, INITIAL);

    tracker.submit("processing");
    tracker.submit("completed", (id) => ({ outputFileName: id + "-dark.pdf" }));
    assert.equal(updates.length, 0, "nothing written before create resolves");

    resolveCreate("doc-1");
    await tracker.flush();

    assert.equal(tracker.currentId(), "doc-1");
    assert.equal(updates.length, 2);
    assert.equal(updates[0].id, "doc-1");
    assert.equal(updates[0].data.status, "processing");
    assert.equal(updates[1].data.status, "completed");
    // function payload receives the id
    assert.equal(updates[1].data.outputFileName, "doc-1-dark.pdf");
    // terminal status gets completedAt
    assert.ok(typeof updates[1].data.completedAt === "number");
    assert.ok(!("completedAt" in updates[0].data));
  });

  test("a failed creation drops queued writes without throwing", async () => {
    const { store, updates, rejectCreate } = manualStore();
    const warnings: string[] = [];
    const tracker = createHistoryTracker(store, INITIAL, (m) =>
      warnings.push(m)
    );

    tracker.submit("processing");
    tracker.submit("completed", { pageCount: 5 });
    rejectCreate(new Error("PERMISSION_DENIED: API disabled"));
    await tracker.flush();

    assert.equal(updates.length, 0, "no writes when there is no record");
    assert.equal(tracker.currentId(), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /could not create the record/);
    assert.match(warnings[0], /API disabled/);
  });

  test("a failed update warns but does not break later writes", async () => {
    const { store, updates, resolveCreate, failNextUpdate } = manualStore();
    const warnings: string[] = [];
    const tracker = createHistoryTracker(store, INITIAL, (m) =>
      warnings.push(m)
    );

    failNextUpdate(new Error("offline"));
    tracker.submit("processing");
    tracker.submit("completed", { pageCount: 2 });
    resolveCreate("doc-9");
    await tracker.flush();

    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /could not write status "processing"/);
    assert.equal(updates.length, 1, "second write still went through");
    assert.equal(updates[0].data.status, "completed");
    assert.equal(tracker.currentId(), "doc-9");
  });
});
