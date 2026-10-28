/** Browser-only temporary resource helpers. They do not promise physical memory erasure. */

export interface CleanupScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface ObjectUrlDownloadOptions {
  /** One event-loop turn is enough to dispatch the synthetic click. */
  delayMs?: number;
  scheduler?: CleanupScheduler;
  /** Keep the source URL when another UI consumer still needs it. */
  revokeAfterDownload?: boolean;
  onRevoked?: () => void;
}

export const DOWNLOAD_URL_REVOKE_DELAY_MS = 10_000;

export const defaultCleanupScheduler: CleanupScheduler = {
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Revoke one browser object URL, tolerating repeated cleanup calls. */
export function revokeObjectUrl(url: string | null | undefined): void {
  if (!url || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(url);
}

/**
 * Revoke a URL after download initiation has had time to start.
 *
 * Browsers do not expose a portable "download fully flushed to disk" event for
 * an object URL. The delay avoids revoking synchronously while the navigation is
 * being dispatched; it is not a guarantee of physical erasure or disk flush.
 */
export function scheduleObjectUrlRevocation(
  url: string,
  delayMs = DOWNLOAD_URL_REVOKE_DELAY_MS,
  scheduler: CleanupScheduler = defaultCleanupScheduler,
  onRevoked?: () => void
): () => void {
  const handle = scheduler.schedule(() => {
    revokeObjectUrl(url);
    onRevoked?.();
  }, delayMs);
  return () => scheduler.cancel(handle);
}

/**
 * Start a browser download without leaving a temporary anchor in the DOM.
 *
 * The caller decides whether the source URL is still needed by a preview,
 * reader, ZIP builder, or another active consumer. When it is not, the URL is
 * revoked after the configured download-start grace period.
 */
export function startObjectUrlDownload(
  url: string,
  fileName: string,
  options: ObjectUrlDownloadOptions = {}
): () => void {
  if (typeof document === "undefined") return () => undefined;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body?.appendChild(link);
  link.click();
  link.remove();

  if (options.revokeAfterDownload === false) return () => undefined;

  return scheduleObjectUrlRevocation(
    url,
    options.delayMs,
    options.scheduler,
    options.onRevoked
  );
}
