/**
 * Regression tests for the object-URL lifetime defects (fixes 2 and 3).
 *
 * Defect 1 (single file): revoking the output URL on download killed the
 * visible download link and the preview/reader, so a second click silently
 * failed.
 *
 * Defect 2 (batch): downloading an item also cleared its `outputUrl`, which
 * dropped it from the ZIP selection ten seconds later and broke repeat
 * downloads.
 *
 * The registry under test is the exact module both components now use, and
 * Node provides real `blob:nodedata:` URLs — `fetch()` resolves them and
 * `resolveObjectURL()` returns `undefined` once revoked — so every scenario
 * below exercises genuine resource behaviour, not stubs.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import JSZip from "jszip";
import {
  createOutputResourceRegistry,
} from "../src/lib/output-resources.ts";
import { DOWNLOAD_URL_REVOKE_DELAY_MS } from "../src/lib/temp-resources.ts";

/** A deterministic CleanupScheduler so the grace period can be flushed. */
function fakeScheduler() {
  const pending: Array<{ run: () => void; delayMs: number }> = [];
  return {
    scheduler: {
      schedule: (callback: () => void, delayMs: number) => {
        pending.push({ run: callback, delayMs });
        return pending.length;
      },
      cancel: () => {},
    },
    /** Flush every scheduled revocation, as elapsing the grace period would. */
    flush: () => {
      while (pending.length > 0) pending.shift()!.run();
    },
    pendingCount: () => pending.length,
    lastDelayMs: () => pending[pending.length - 1]?.delayMs,
  };
}

const blobUrl = (text: string) => URL.createObjectURL(new Blob([text]));

describe("output resource registry", () => {
  test("retain/get/has/keys/urls/size track held URLs", () => {
    const registry = createOutputResourceRegistry();
    assert.equal(registry.size, 0);
    assert.equal(registry.get("output"), undefined);
    assert.equal(registry.has("output"), false);

    registry.retain("original", blobUrl("a"));
    registry.retain("output", blobUrl("b"));

    assert.equal(registry.size, 2);
    assert.equal(registry.has("original"), true);
    assert.deepEqual(registry.keys(), ["original", "output"]);
    assert.equal(registry.urls().length, 2);
    assert.ok(registry.get("original")!.startsWith("blob:"));
  });

  test("repeated downloads never revoke the URL (fix: one-shot links)", async () => {
    const { scheduler, flush, pendingCount } = fakeScheduler();
    const url = blobUrl("downloadable");
    const registry = createOutputResourceRegistry({ scheduler });
    registry.retain("output", url);

    // The user clicks Download three times — each dispatch marks only.
    registry.markDownloaded("output");
    registry.markDownloaded("output");
    registry.markDownloaded("output");

    assert.equal(registry.wasDownloaded("output"), true);
    assert.equal(registry.get("output"), url);
    assert.equal(pendingCount(), 0, "a download never schedules a revocation");
    // The URL is still genuinely alive: it resolves and serves its bytes.
    assert.ok(resolveObjectURL(url), "URL must still resolve after downloads");
    const response = await fetch(url);
    assert.equal(await response.text(), "downloadable");
    registry.releaseAll();
    flush();
  });

  test("ZIP generation still works after every item was downloaded individually (fix: batch ZIP)", async () => {
    // Mirrors the batch component: three converted items, each downloaded once,
    // then zipped. Before the fix the downloads cleared each item's outputUrl,
    // so the ZIP silently contained only the not-yet-downloaded items.
    const { scheduler, flush } = fakeScheduler();
    const registry = createOutputResourceRegistry({ scheduler });
    const items = [
      { key: "item:a1", name: "report.pdf", bytes: "first-output" },
      { key: "item:b2", name: "slides.pptx", bytes: "second-output" },
      { key: "item:c3", name: "notes.docx", bytes: "third-output" },
    ];
    for (const item of items) {
      registry.retain(item.key, blobUrl(item.bytes));
      registry.markDownloaded(item.key);
    }

    // Registry state is exactly what the component uses to render the list.
    assert.equal(registry.size, 3);
    for (const item of items) {
      const url = registry.get(item.key);
      assert.ok(url, `${item.key} must survive its download`);
      assert.ok(url!.startsWith("blob:"), `${item.key} still holds a live object URL`);
    }

    // The component's ZIP loop: fetch every completed item's URL, then build.
    const zip = new JSZip();
    for (const item of items) {
      const url = registry.get(item.key);
      assert.ok(url, "item must remain in the ZIP set after its download");
      const response = await fetch(url!);
      zip.file(item.name, await response.arrayBuffer());
    }
    const archive = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });

    const roundTrip = await JSZip.loadAsync(await archive.arrayBuffer());
    const names = Object.keys(roundTrip.files).sort();
    assert.deepEqual(names, ["notes.docx", "report.pdf", "slides.pptx"]);
    assert.equal(await roundTrip.file("report.pdf")!.async("string"), "first-output");
    assert.equal(await roundTrip.file("slides.pptx")!.async("string"), "second-output");
    assert.equal(await roundTrip.file("notes.docx")!.async("string"), "third-output");

    registry.releaseAll();
    flush();
  });

  test("cancellation releases a never-downloaded URL immediately", () => {
    // The UploadZone error/cancel paths release the original preview URL,
    // which no download ever touched — it must be revoked at once.
    const { scheduler, pendingCount } = fakeScheduler();
    const registry = createOutputResourceRegistry({ scheduler });
    const url = blobUrl("original");
    registry.retain("original", url);

    registry.release("original");

    assert.equal(pendingCount(), 0, "no grace period for an un-dispatched URL");
    assert.equal(resolveObjectURL(url), undefined, "URL must be revoked immediately");
    assert.equal(registry.size, 0);
  });

  test("reset (releaseAll) revokes every URL that had no download in flight", () => {
    const registry = createOutputResourceRegistry();
    const urls = [blobUrl("one"), blobUrl("two"), blobUrl("three")];
    urls.forEach((url, index) => registry.retain(`k${index}`, url));

    registry.releaseAll();

    for (const url of urls) {
      assert.equal(resolveObjectURL(url), undefined, "every URL revoked on reset");
    }
    assert.equal(registry.size, 0);
    registry.releaseAll(); // idempotent
  });

  test("unmount after a download keeps the URL alive for the grace period, then revokes", () => {
    const { scheduler, flush, pendingCount, lastDelayMs } = fakeScheduler();
    const registry = createOutputResourceRegistry({ scheduler });
    const url = blobUrl("in-flight");
    registry.retain("output", url);
    registry.markDownloaded("output");

    registry.releaseAll(); // unmount

    // The navigation may still be starting: not revoked yet, still resolvable.
    assert.equal(registry.size, 0, "bookkeeping cleared immediately");
    assert.equal(pendingCount(), 1, "revocation deferred to the grace period");
    assert.equal(lastDelayMs(), DOWNLOAD_URL_REVOKE_DELAY_MS);
    assert.ok(resolveObjectURL(url), "URL alive during the grace period");

    flush(); // the grace period elapses
    assert.equal(resolveObjectURL(url), undefined, "URL revoked after the grace period");
  });

  test("replacing an output releases the previous URL; same-URL re-retain keeps its download mark", () => {
    const { scheduler, flush, pendingCount } = fakeScheduler();
    const registry = createOutputResourceRegistry({ scheduler });
    const first = blobUrl("first");
    const second = blobUrl("second");
    registry.retain("output", first);

    // Re-syncing state with the identical URL must not lose the mark.
    registry.markDownloaded("output");
    registry.retain("output", first);
    assert.equal(registry.wasDownloaded("output"), true);
    assert.ok(resolveObjectURL(first), "same-URL retain must not revoke");

    // A genuinely new output replaces the old one. The old URL had a
    // download dispatched, so its revocation waits for the grace period.
    registry.retain("output", second);
    assert.equal(registry.get("output"), second);
    assert.ok(resolveObjectURL(first), "replaced URL alive during its grace period");
    assert.ok(resolveObjectURL(second), "new URL alive");
    assert.equal(pendingCount(), 1);

    flush();
    assert.equal(resolveObjectURL(first), undefined, "replaced URL revoked after the grace period");
    registry.releaseAll();
    flush();
    assert.equal(resolveObjectURL(second), undefined, "new URL revoked on release");
  });

  test("markDownloaded ignores keys the registry does not own", () => {
    const registry = createOutputResourceRegistry();
    registry.markDownloaded("ghost");
    assert.equal(registry.wasDownloaded("ghost"), false);
    registry.retain("ghost", blobUrl("x"));
    registry.release("ghost");
    registry.release("never-existed"); // no throw
  });
});
