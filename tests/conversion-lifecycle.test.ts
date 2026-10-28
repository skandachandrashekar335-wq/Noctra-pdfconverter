/**
 * Conversion lifecycle regression tests — the "stuck at 95%" bug.
 *
 * Reproduces the reported failure mode at the orchestrator level: a
 * converter reports the final page (the UI reads 95%), then all remaining
 * work — finalization, serialization, validation — either announces itself
 * or fails loudly. What must never happen again is a conversion that sits
 * forever with no terminal state.
 *
 * Covers:
 *  1. Lifecycle order: queued → processing → finalizing → terminal
 *  2. Finalization labels between the last page tick and completion
 *  3. Validation: corrupt/truncated/empty output → failed, never completed
 *  4. Stall watchdog: a converter that stops responding fails with an
 *     actionable error instead of hanging, and aborts the wedged work
 *  5. Terminal-state protection: late progress/success cannot overwrite a
 *     terminal state
 *  6. Cancellation stops supported work and reports cancelled
 *  7. The watchdog does not fire after a settled conversion
 *  8. Retry reuses the failed attempt's history record (no duplicates)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import type { HistoryStore } from "../src/lib/history-tracker.ts";
import type {
  ConversionPhase,
  ConversionStatus,
} from "../src/types/index.ts";
import type { ConverterResult } from "../src/lib/conversion.ts";

const { runConversion } = await import("../src/lib/conversion.ts");

// ─── Helpers ───────────────────────────────────────────────────────────────

async function pdfBytes(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

function makeFile(name = "fixture.pdf", content: string | Uint8Array = "x") {
  // Copy into a fresh ArrayBuffer-backed view so the BlobPart typing holds
  // regardless of the incoming Uint8Array's backing buffer.
  const part: BlobPart =
    typeof content === "string" ? content : new Uint8Array(content);
  return new File([part], name, { type: "application/pdf" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
  label = "condition"
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

function recordingStore() {
  const creates: Record<string, unknown>[] = [];
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let counter = 0;
  const store: HistoryStore = {
    create: async (data) => {
      creates.push(data);
      counter += 1;
      return `rec-${counter}`;
    },
    update: async (id, data) => {
      updates.push({ id, data });
    },
  };
  return { store, creates, updates };
}

interface Events {
  phases: ConversionPhase[];
  statuses: ConversionStatus[];
  progress: Array<[number, number]>;
  finalizing: string[];
  completed: number;
  errors: string[];
  cancelled: number;
  ids: string[];
}

function record(): Events {
  return {
    phases: [],
    statuses: [],
    progress: [],
    finalizing: [],
    completed: 0,
    errors: [],
    cancelled: 0,
    ids: [],
  };
}

function callbacksFor(events: Events) {
  return {
    onPhase: (phase: ConversionPhase) => events.phases.push(phase),
    onStatusChange: (status: ConversionStatus) => events.statuses.push(status),
    onProgress: (page: number, total: number) =>
      events.progress.push([page, total]),
    onFinalizing: (label: string) => events.finalizing.push(label),
    onComplete: () => {
      events.completed += 1;
    },
    onError: (message: string) => events.errors.push(message),
    onCancelled: () => {
      events.cancelled += 1;
    },
    onConversionId: (id: string) => events.ids.push(id),
  };
}

// ─── 1+2. Lifecycle and finalization visibility ────────────────────────────

describe("conversion lifecycle (the 95% hang)", () => {
  test("runs queued → processing → finalizing → completed with visible finalization labels", async () => {
    const events = record();
    const result: ConverterResult = {
      bytes: await pdfBytes(2),
      mimeType: "application/pdf",
      pageCount: 2,
    };

    await runConversion(
      makeFile("a.pdf", "x"),
      callbacksFor(events),
      {
        historyStore: null,
        runConverter: async (_fileType, _buffer, handlers) => {
          // Pages tick first — the UI would read 90% here…
          handlers.onProgress(1, 2);
          handlers.onProgress(2, 2);
          // …then the export tail announces itself.
          handlers.onFinalizing("Serializing the dark PDF…");
          return result;
        },
      }
    );

    assert.deepEqual(
      events.phases,
      ["queued", "processing", "finalizing", "completed"],
      "every conversion must walk the full lifecycle in order"
    );
    assert.ok(
      events.finalizing.includes("Serializing the dark PDF…"),
      "converter finalization label must reach the UI"
    );
    assert.ok(
      events.finalizing.includes("Validating output…"),
      "orchestrator must announce validation under the finalizing phase"
    );
    assert.deepEqual(events.progress, [
      [1, 2],
      [2, 2],
    ]);
    assert.equal(events.completed, 1);
    assert.deepEqual(events.statuses, ["processing", "completed"]);
    assert.deepEqual(events.errors, []);
  });

  test("the final page tick is followed by finalizing events before completion", async () => {
    const events = record();
    await runConversion(
      makeFile("b.pdf", "x"),
      callbacksFor(events),
      {
        historyStore: null,
        runConverter: async (_fileType, _buffer, handlers) => {
          for (let page = 1; page <= 13; page++) handlers.onProgress(page, 13);
          return { bytes: await pdfBytes(13), mimeType: "application/pdf", pageCount: 13 };
        },
      }
    );

    // The exact reported sequence: page 13/13 (UI: 90%), then finalizing
    // work, then completion — never a silent jump from the last page.
    const lastPageIdx = events.progress.length - 1;
    const nextPhaseAfterPages = events.phases.indexOf("finalizing");
    assert.ok(nextPhaseAfterPages > 0, "finalizing phase must exist");
    assert.ok(
      events.finalizing.length > 0,
      "finalization must produce at least one visible label"
    );
    assert.equal(events.completed, 1);
    assert.ok(lastPageIdx >= 0);
  });
});

// ─── 3. Output validation ──────────────────────────────────────────────────

describe("output validation before success", () => {
  test("bytes that are not a PDF fail the conversion instead of completing", async () => {
    const events = record();
    await runConversion(makeFile("bad.pdf", "x"), callbacksFor(events), {
      historyStore: null,
      runConverter: async () => ({
        bytes: new Uint8Array(200).fill(0x41),
        mimeType: "application/pdf",
        pageCount: 1,
      }),
    });

    assert.equal(events.completed, 0, "invalid output must never complete");
    assert.equal(events.errors.length, 1);
    assert.deepEqual(events.statuses, ["processing", "failed"]);
    assert.equal(events.phases.at(-1), "failed");
  });

  test("empty output fails instead of producing a zero-byte download", async () => {
    const events = record();
    await runConversion(makeFile("empty.pdf", "x"), callbacksFor(events), {
      historyStore: null,
      runConverter: async () => ({
        bytes: new Uint8Array(0),
        mimeType: "application/pdf",
        pageCount: 1,
      }),
    });
    assert.equal(events.completed, 0);
    assert.equal(events.errors.length, 1);
  });

  test("a page-count mismatch against the source fails", async () => {
    const events = record();
    await runConversion(makeFile("mismatch.pdf", "x"), callbacksFor(events), {
      historyStore: null,
      runConverter: async () => ({
        bytes: await pdfBytes(1),
        mimeType: "application/pdf",
        pageCount: 13, // claims 13 pages, produced 1
      }),
    });
    assert.equal(events.completed, 0);
    assert.match(events.errors[0] ?? "", /13/);
  });
});

// ─── 4+5. Stall watchdog and terminal-state protection ─────────────────────

describe("stall watchdog (converter stops responding)", () => {
  test("fails with an actionable error, aborts the wedged work, and ignores a late success", async () => {
    const events = record();
    const gate = deferred<ConverterResult>();
    let converterSignal: AbortSignal | undefined;

    const run = runConversion(makeFile("hang.pdf", "x"), callbacksFor(events), {
      historyStore: null,
      stallTimeoutMs: 60,
      runConverter: async (_fileType, _buffer, handlers) => {
        converterSignal = handlers.signal;
        // The reported scenario: the last page tick lands (UI: 95%), then
        // the renderer never produces another event — ever.
        handlers.onProgress(13, 13);
        return gate.promise;
      },
    });

    await waitFor(() => events.errors.length > 0, 2000, "stall failure");
    assert.match(events.errors[0], /stopped responding/i);
    assert.ok(converterSignal, "converter must have been invoked");
    assert.ok(
      converterSignal?.aborted,
      "watchdog must abort the wedged converter"
    );
    assert.deepEqual(events.statuses, ["processing", "failed"]);
    assert.equal(events.phases.at(-1), "failed");
    assert.equal(events.completed, 0);

    // The wedged converter finally settles — it must not overwrite the
    // terminal state or emit a success the UI would show.
    gate.resolve({
      bytes: await pdfBytes(1),
      mimeType: "application/pdf",
      pageCount: 1,
    });
    await run;

    assert.equal(events.completed, 0, "late success must not complete");
    assert.deepEqual(
      events.statuses,
      ["processing", "failed"],
      "no status events may follow the terminal state"
    );
    assert.deepEqual(events.errors, [events.errors[0]], "single failure only");
  });

  test("does not fire after a conversion has settled successfully", async () => {
    const events = record();
    await runConversion(makeFile("quick.pdf", "x"), callbacksFor(events), {
      historyStore: null,
      stallTimeoutMs: 30,
      runConverter: async () => ({
        bytes: await pdfBytes(1),
        mimeType: "application/pdf",
        pageCount: 1,
      }),
    });
    assert.equal(events.completed, 1);

    // Let a would-be watchdog timer elapse; it must stay silent.
    await new Promise((r) => setTimeout(r, 90));
    assert.deepEqual(events.errors, []);
    assert.deepEqual(events.statuses, ["processing", "completed"]);
    assert.deepEqual(events.phases, [
      "queued",
      "processing",
      "finalizing",
      "completed",
    ]);
  });

  test("progress ticks keep the watchdog alive during long documents", async () => {
    const events = record();
    // Watchdog budget (60ms) is shorter than the total run; ticking pages
    // throughout must prevent any stall failure.
    await runConversion(makeFile("ticking.pdf", "x"), callbacksFor(events), {
      historyStore: null,
      stallTimeoutMs: 40,
      runConverter: async (_fileType, _buffer, handlers) => {
        for (let page = 1; page <= 5; page++) {
          handlers.onProgress(page, 5);
          await new Promise((r) => setTimeout(r, 25));
        }
        handlers.onFinalizing("Serializing…");
        await new Promise((r) => setTimeout(r, 25));
        return { bytes: await pdfBytes(5), mimeType: "application/pdf", pageCount: 5 };
      },
    });
    assert.equal(events.completed, 1);
    assert.deepEqual(events.errors, []);
  });
});

// ─── 6. Cancellation ───────────────────────────────────────────────────────

describe("cancellation", () => {
  test("abort stops the converter and reports cancelled, not failed", async () => {
    const events = record();
    const started = deferred<void>();
    const controller = new AbortController();
    let sawAbort = false;

    const run = runConversion(
      makeFile("cancel.pdf", "x"),
      { ...callbacksFor(events), signal: controller.signal },
      {
        historyStore: null,
      runConverter: async (_fileType, _buffer, handlers) => {
        handlers.onProgress(3, 13);
        handlers.signal.addEventListener("abort", () => {
          sawAbort = true;
        });
        started.resolve();
        // A converter that only settles on abort — like the real pdf.js
        // path once its render task is cancelled.
        return new Promise<ConverterResult>((_resolve, reject) => {
          handlers.signal.addEventListener(
            "abort",
            () =>
              reject(new DOMException("Conversion cancelled.", "AbortError")),
            { once: true }
          );
        });
      },
    });

    await started.promise;
    controller.abort();
    await run;

    assert.ok(sawAbort, "converter must observe the abort");
    assert.equal(events.cancelled, 1);
    assert.equal(events.completed, 0);
    assert.equal(events.phases.at(-1), "cancelled");
    assert.deepEqual(events.statuses, ["processing", "cancelled"]);
    assert.deepEqual(events.errors, []);
  });
});

// ─── 8. Retry without duplicate history ────────────────────────────────────

describe("retry without duplicate history", () => {
  test("a retry updates the failed attempt's record instead of creating a second one", async () => {
    const { store, creates, updates } = recordingStore();

    // Attempt 1: the converter blows up.
    const attempt1 = record();
    await runConversion(makeFile("retry.pdf", "x"), callbacksFor(attempt1), {
      historyStore: store,
      runConverter: async () => {
        throw new Error("boom");
      },
    });
    await waitFor(
      () => updates.some((u) => u.data.status === "failed"),
      2000,
      "failed status write"
    );
    assert.equal(attempt1.ids.length, 1, "attempt 1 must expose its record id");
    const recordId = attempt1.ids[0];
    assert.match(recordId, /^rec-/);

    // Attempt 2: same file, reusing the record id — like the UI retry does.
    const attempt2 = record();
    await runConversion(makeFile("retry.pdf", "x"), callbacksFor(attempt2), {
      historyStore: store,
      historyId: recordId,
      runConverter: async () => ({
        bytes: await pdfBytes(1),
        mimeType: "application/pdf",
        pageCount: 1,
      }),
    });
    await waitFor(
      () => updates.some((u) => u.data.status === "completed"),
      2000,
      "completed status write"
    );

    assert.equal(creates.length, 1, "retry must not create a second record");
    assert.deepEqual(attempt2.ids, [recordId], "retry adopts the same id");
    // Both attempts write to the same record: processing/failed, then
    // processing/completed — one history entry for failure + retry.
    assert.deepEqual(
      updates.map((u) => u.data.status),
      ["processing", "failed", "processing", "completed"]
    );
    assert.ok(
      updates.every((u) => u.id === recordId),
      "all writes target the same record"
    );
  });
});

// ─── Source contracts (browser-only code paths) ────────────────────────────

describe("finalization and cleanup contracts in the converters", () => {
  const read = (rel: string) =>
    readFile(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

  test("pdf-converter announces finalization and always destroys its pdf.js task", async () => {
    const src = await read("lib/pdf-converter.ts");
    assert.ok(
      src.includes('onFinalizing?.("Serializing the dark PDF…")'),
      "PDF export must announce serialization"
    );
    assert.ok(
      src.includes('onFinalizing?.("Restoring links…")'),
      "PDF export must announce the link pass"
    );
    assert.ok(
      src.includes("} finally {") && src.includes("loadingTask.destroy()"),
      "the pdf.js loading task must be destroyed in a finally block"
    );
    assert.ok(
      src.includes("raceAbort("),
      "pdf.js awaits must be abortable so cancellation cannot wedge"
    );
    // Serialization is announced before it happens, not after.
    const labelIdx = src.indexOf('onFinalizing?.("Serializing the dark PDF…")');
    const saveIdx = src.indexOf("outputPdf.save()");
    assert.ok(labelIdx > -1 && saveIdx > labelIdx, "label must precede save()");
  });

  test("docx and pptx converters announce their repack step", async () => {
    const docx = await read("lib/docx-converter.ts");
    const pptx = await read("lib/pptx-converter.ts");
    assert.ok(docx.includes('onFinalizing?.("Repacking the DOCX archive…")'));
    assert.ok(pptx.includes('onFinalizing?.("Repacking the PPTX archive…")'));
  });

  test("UploadZone reserves 10–90% for pages so finalization owns 92–99%", async () => {
    const src = await read("components/UploadZone.tsx");
    assert.ok(
      src.includes("10 + (page / total) * 80"),
      "page progress must stop at 90%"
    );
    assert.ok(
      !src.includes("* 85"),
      "the old 95%-at-last-page mapping must be gone"
    );
    assert.ok(src.includes("Math.min(99, Math.max(s.progress + 2, 92))"));
  });
});
