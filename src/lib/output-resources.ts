/**
 * Lifetime bookkeeping for the object URLs that hold converted documents.
 *
 * Why this exists: a `blob:` URL is valid only until it is revoked, and a
 * revoked URL is *silently* dead — an `<a download>` that still points at one
 * fails with no visible error. Two shipped defects came from revoking too
 * eagerly:
 *
 *  1. Single-file: revoking on download killed the URL while the download
 *     link was still on screen, so a second click did nothing.
 *  2. Batch: revoking on download also cleared the item's `outputUrl`, so ten
 *     seconds after downloading a file its Download link vanished and it
 *     dropped out of the ZIP selection without warning.
 *
 * The rule this module enforces is: **a URL lives exactly as long as its
 * consumers.** Nothing is revoked because a download started. URLs are
 * released only when their owner tears down — reset, retry, cancellation or
 * unmount — and a URL whose download was dispatched gets the grace period so
 * an in-flight navigation is not cut off mid-download.
 *
 * Pure bookkeeping with no DOM dependency, so `node --test` can drive every
 * lifecycle (repeated downloads, ZIP generation after downloads, cancellation,
 * reset, unmount, cleanup) against real `blob:` URLs.
 */

import {
  DOWNLOAD_URL_REVOKE_DELAY_MS,
  revokeObjectUrl,
  scheduleObjectUrlRevocation,
  type CleanupScheduler,
} from "@/lib/temp-resources";

export interface OutputResourceOptions {
  /**
   * Timer backend. Injected so tests can flush the grace period
   * deterministically instead of waiting out the real 10s delay.
   */
  scheduler?: CleanupScheduler;
  /** Grace period applied to a URL that had a download dispatched. */
  graceMs?: number;
}

export interface OutputResourceRegistry {
  /**
   * Take ownership of `url` under `key`. Any different URL previously held
   * under that key is released first, so replacing an output can never leak
   * the old one.
   */
  retain(key: string, url: string): void;
  /** The URL currently held under `key`, or undefined. */
  get(key: string): string | undefined;
  has(key: string): boolean;
  /** Every key currently held, in insertion order. */
  keys(): string[];
  /** Every URL currently held, in insertion order. */
  urls(): string[];
  /**
   * Record that a download was dispatched from this key's URL. Marks only —
   * it never revokes, which is what keeps the link usable for repeat clicks
   * and keeps the URL available to the ZIP builder.
   */
  markDownloaded(key: string): void;
  /** Whether a download was ever dispatched for `key`. */
  wasDownloaded(key: string): boolean;
  /** Release one key immediately (or after the grace period if downloaded). */
  release(key: string): void;
  /** Release every held URL — the reset / unmount path. */
  releaseAll(): void;
  /** Number of URLs currently held. */
  readonly size: number;
}

export function createOutputResourceRegistry(
  options: OutputResourceOptions = {}
): OutputResourceRegistry {
  const graceMs = options.graceMs ?? DOWNLOAD_URL_REVOKE_DELAY_MS;
  const scheduler = options.scheduler;

  const held = new Map<string, string>();
  const downloaded = new Set<string>();

  function releaseUrl(url: string, wasDownloaded: boolean): void {
    if (wasDownloaded) {
      // The download navigation may still be starting; revoke only once the
      // grace period has elapsed so it is not cut off mid-flight.
      scheduleObjectUrlRevocation(url, graceMs, scheduler);
      return;
    }
    revokeObjectUrl(url);
  }

  function retain(key: string, url: string): void {
    if (!url) return;
    const previous = held.get(key);
    // Re-retaining the same URL must not clear its download mark: the caller
    // may re-sync state without the underlying resource having changed.
    if (previous === url) return;
    if (previous !== undefined) {
      releaseUrl(previous, downloaded.has(key));
      downloaded.delete(key);
    }
    held.set(key, url);
  }

  function markDownloaded(key: string): void {
    // Only mark URLs this registry actually owns, so a stale click cannot
    // leave an orphan entry behind.
    if (held.has(key)) downloaded.add(key);
  }

  function release(key: string): void {
    const url = held.get(key);
    if (url === undefined) return;
    held.delete(key);
    releaseUrl(url, downloaded.has(key));
    downloaded.delete(key);
  }

  function releaseAll(): void {
    for (const [key, url] of held) {
      releaseUrl(url, downloaded.has(key));
    }
    held.clear();
    downloaded.clear();
  }

  return {
    retain,
    get: (key) => held.get(key),
    has: (key) => held.has(key),
    keys: () => [...held.keys()],
    urls: () => [...held.values()],
    markDownloaded,
    wasDownloaded: (key) => downloaded.has(key),
    release,
    releaseAll,
    get size() {
      return held.size;
    },
  };
}
