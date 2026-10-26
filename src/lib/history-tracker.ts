/**
 * Serialised, fire-and-forget writer for the conversion-history record.
 *
 * Why this exists: `runConversion` used to write the history record *before*
 * starting the in-browser conversion. The backend only settles that promise
 * once it acknowledges the write — and while it is unreachable (API disabled,
 * database missing, offline, Supabase unconfigured) the promise stays pending
 * indefinitely. The UI therefore froze at "Preparing…" forever even though the
 * conversion itself needs no network at all.
 *
 * Contract:
 *  - Record creation starts immediately and never blocks the caller.
 *  - Writes submitted before creation settles are queued and flushed in order
 *    once the id is known (late success → the final status still lands).
 *  - If creation fails, queued writes are skipped — nothing ever rejects.
 *
 * The store is injected, so nothing here depends on a particular backend —
 * and it stays unit tested with `node --test` and no live credentials.
 */

import type { Conversion, ConversionStatus } from "@/types";

/**
 * The two operations the tracker needs from a history backend — injectable so
 * tests can simulate one that hangs, fails, or reorders.
 */
export interface HistoryStore {
  create(data: Record<string, unknown>): Promise<string>;
  update(id: string, data: Record<string, unknown>): Promise<void>;
}

/**
 * Extra fields for a status write. A function receives the record id once it
 * is known, so fields derived from the id can be computed after a
 * late-arriving creation.
 */
export type HistoryPayload =
  | Partial<Conversion>
  | ((id: string) => Partial<Conversion>);

export interface HistoryTracker {
  /** Queue a status write. Never throws, never returns a pending promise. */
  submit(status: ConversionStatus, extra?: HistoryPayload): void;
  /** The record id once creation has succeeded, else null. */
  currentId(): string | null;
  /** Resolves when creation and every queued write have settled (tests). */
  flush(): Promise<void>;
}

export function createHistoryTracker(
  store: HistoryStore | null,
  initialData: Record<string, unknown>,
  onWarn: (message: string) => void = console.warn
): HistoryTracker {
  let id: string | null = null;

  // Start creation now; map both outcomes so the chain never rejects and
  // always settles when the backend responds (or never settles if it hangs —
  // which is fine: queued writes would have no id to target anyway).
  let tail: Promise<void> = Promise.resolve();
  if (store) {
    const s = store;
    tail = s.create(initialData).then(
      (createdId) => {
        id = createdId;
      },
      (err: unknown) => {
        id = null;
        onWarn(
          "History: could not create the record — continuing without history (" +
            String(err) +
            ")."
        );
      }
    );
  }

  function submit(status: ConversionStatus, extra: HistoryPayload = {}): void {
    if (!store) return;
    const s = store;
    tail = tail.then(async () => {
      const recordId = id;
      if (!recordId) return; // creation failed — nothing to write to
      const payload = typeof extra === "function" ? extra(recordId) : extra;
      const terminal = status === "completed" || status === "failed";
      try {
        await s.update(recordId, {
          status,
          ...payload,
          ...(terminal ? { completedAt: Date.now() } : {}),
        });
      } catch (err) {
        onWarn(`History: could not write status "${status}" (${String(err)}).`);
      }
    });
  }

  return {
    submit,
    currentId: () => id,
    flush: () => tail,
  };
}
