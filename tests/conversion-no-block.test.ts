/**
 * Regression guards for the "stuck at 5%" bug.
 *
 * `runConversion` used to `await addDoc(...)` before starting the in-browser
 * conversion. The backend only settles that promise when it acknowledges the
 * write — with Firestore's API disabled (or offline, or a slow/absent
 * Supabase), the promise stayed pending forever and the UI froze at
 * "Preparing…".
 *
 * The transport is now `fetch` against `/api/history` instead of the
 * Firestore SDK, but the failure mode is identical, so the guards cover both:
 * anything the orchestrator *awaits* on the history path can hang it.
 *
 * These are source-level assertions (same style as the converter privacy
 * tests) because the live behaviour needs a backend to hang; the end-to-end
 * version of that is in `run-conversion.integration.test.ts`.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const src = await readFile(
  fileURLToPath(new URL("../src/lib/conversion.ts", import.meta.url)),
  "utf8"
);

describe("runConversion must never block on history writes", () => {
  test("no awaited writes from either history transport", () => {
    for (const fn of ["addDoc", "updateDoc", "setDoc"]) {
      assert.ok(
        !new RegExp(`await\\s+${fn}\\s*\\(`).test(src),
        `awaiting ${fn} re-introduces the infinite 'Preparing…' hang`
      );
    }
    // The Supabase-backed transport: the orchestrator must not await the
    // store's create/update either, or a slow POST stalls completion.
    assert.ok(
      !/await\s+history\.(create|update|flush)\s*\(/.test(src),
      "awaiting a history-store call stalls completion on a slow backend"
    );
    assert.ok(
      !/await\s+historyFetch\s*\(/.test(src),
      "awaiting historyFetch directly bypasses the non-blocking tracker"
    );
  });

  test("history writes go through the non-blocking tracker", () => {
    assert.ok(
      src.includes("createHistoryTracker"),
      "conversion history must be written via history-tracker (fire-and-forget)"
    );
    // Store calls may appear as callbacks passed TO the tracker,
    // but their results must never be awaited by the orchestrator (covered by
    // the test above).
    assert.ok(
      src.includes("history.submit("),
      "status updates must be queued via history.submit"
    );
    assert.ok(
      !src.includes("firebase/firestore"),
      "the orchestrator must not reintroduce a Firestore import"
    );
  });

  test("a missing or failing storage backend no longer aborts the conversion", () => {
    // Old behaviour: `if (!db) { onError(...); return; }` — the in-browser
    // converter needs no network, so it must still run.
    assert.ok(
      !/if\s*\(\s*!\s*(?:db|firestore)\s*\)\s*\{[^}]*onError[\s\S]{0,200}?\breturn;/.test(
        src
      ),
      "conversion must proceed without history tracking"
    );
    // The store is chosen once, outside the try/catch, so an unavailable
    // backend cannot short-circuit before the conversion starts.
    assert.ok(
      !/createRemoteHistoryStore\(\)[\s\S]{0,300}?\breturn;/.test(
        src.slice(src.indexOf("try {"))
      ),
      "history setup failure must not return early from runConversion"
    );
  });

  test("history failures are reported through the dedicated channel", () => {
    assert.ok(
      src.includes("onHistoryError"),
      "a storage failure must be surfaced separately from onError, so the UI "
        + "can say 'history not saved' without claiming the conversion failed"
    );
    assert.ok(
      !/onError\?\.\(\s*(?:msg|message)\s*\)[\s\S]{0,80}history/i.test(src),
      "history problems must never be routed to onError"
    );
  });
});
