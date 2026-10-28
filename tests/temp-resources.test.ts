import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  revokeObjectUrl,
  scheduleObjectUrlRevocation,
  type CleanupScheduler,
} from "../src/lib/temp-resources.ts";

describe("temporary browser resources", () => {
  test("revokes an object URL through the browser API", () => {
    const original = URL.revokeObjectURL;
    const revoked: string[] = [];
    URL.revokeObjectURL = ((url: string) => revoked.push(url)) as typeof URL.revokeObjectURL;
    try {
      revokeObjectUrl("blob:test");
      revokeObjectUrl(undefined);
      assert.deepEqual(revoked, ["blob:test"]);
    } finally {
      URL.revokeObjectURL = original;
    }
  });

  test("schedules cleanup and allows unmount/cancellation to cancel the timer", () => {
    const callbacks: Array<() => void> = [];
    const cancelled = new Set<unknown>();
    const handles: unknown[] = [];
    const scheduler: CleanupScheduler = {
      schedule: (next, delayMs) => {
        assert.equal(delayMs, 10_000);
        const handle = `timer-${handles.length + 1}`;
        handles.push(handle);
        callbacks.push(() => { if (!cancelled.has(handle)) next(); });
        return handle;
      },
      cancel: (handle) => { cancelled.add(handle); },
    };
    const original = URL.revokeObjectURL;
    const revoked: string[] = [];
    URL.revokeObjectURL = ((url: string) => revoked.push(url)) as typeof URL.revokeObjectURL;
    try {
      const cancel = scheduleObjectUrlRevocation("blob:test", 10_000, scheduler);
      cancel();
      callbacks[0]();
      assert.deepEqual(revoked, []);

      let notified = false;
      scheduleObjectUrlRevocation("blob:active", 10_000, scheduler, () => {
        notified = true;
      });
      callbacks[1]();
      assert.deepEqual(revoked, ["blob:active"]);
      assert.equal(notified, true);
    } finally {
      URL.revokeObjectURL = original;
    }
  });
});
