/**
 * The Dark Sweep — the state model behind the live conversion strip.
 *
 * Pure and DOM-free so every rule the UI displays is unit-testable in Node.
 * Every transition here is driven by a *real* event from the conversion
 * pipeline — never by timers or interpolated percentages:
 *
 *  - `sweepTick`          — `onProgress(page, total)`: the converter began
 *                           page N. Because the page loop is sequential,
 *                           pages 1..N-1 are proven finished at this point.
 *  - `sweepPreview`       — `onPagePreview(page, total, preview)`: real
 *                           before/after thumbnails captured from the page
 *                           canvas around the dark transform. The arrival of
 *                           an `after` image is direct proof the page was
 *                           transformed.
 *  - `sweepFinalizing`    — the converter left the page loop (finalisation
 *                           labels only fire after it), so every page is done.
 *  - `sweepSettle`        — a terminal state (complete / cancelled / failed).
 *
 * Honesty rules baked into `sweepTileState`:
 *  - A tile only reads `done` when a real event proved the page finished
 *    (a later tick, a transformed thumbnail, the finalising phase, or
 *    successful completion).
 *  - After cancel/failure, unproven tiles stay `queued` and the in-flight
 *    page reads `stopped` — the strip freezes at the truth instead of
 *    pretending the document finished.
 */

/** Real thumbnails captured from the page canvas around the transform. */
export interface PagePreview {
  /** The rendered page *before* the dark transform (JPEG data URL). */
  before?: string;
  /** The same page *after* the dark transform (JPEG data URL). */
  after?: string;
}

export type SweepStatus = "running" | "complete" | "cancelled" | "failed";

export interface SweepState {
  status: SweepStatus;
  /** Page/slide/part count from the first progress tick; 0 until then. */
  total: number;
  /** Highest page index whose *start* tick has fired (1-based). */
  started: number;
  /** True once finalisation begins — the page loop provably finished. */
  finalizing: boolean;
  /** Real thumbnails keyed by page index (1-based). */
  previews: Readonly<Record<number, PagePreview>>;
}

/** What a single tile of the strip shows. */
export type SweepTileState = "queued" | "sweeping" | "stopped" | "done";

export function createSweep(): SweepState {
  return { status: "running", total: 0, started: 0, finalizing: false, previews: {} };
}

/** The converter began page `page` of `total` (sequential loop). */
export function sweepTick(
  state: SweepState,
  page: number,
  total: number
): SweepState {
  if (state.status !== "running") return state;
  const nextTotal = total > 0 ? total : state.total;
  const nextStarted = Math.max(state.started, page);
  if (nextTotal === state.total && nextStarted === state.started) return state;
  return { ...state, total: nextTotal, started: nextStarted };
}

/**
 * Real thumbnails arrived for `page`. Partial payloads are merged (the
 * converter fires once when the light page is captured and again once the
 * dark transform is captured), and late events after a terminal state are
 * ignored so a frozen strip can never resume on its own.
 */
export function sweepPreview(
  state: SweepState,
  page: number,
  preview: PagePreview
): SweepState {
  if (state.status !== "running") return state;
  const existing = state.previews[page];
  const merged: PagePreview = {
    before: preview.before ?? existing?.before,
    after: preview.after ?? existing?.after,
  };
  if (existing?.before === merged.before && existing?.after === merged.after) {
    return state;
  }
  return { ...state, previews: { ...state.previews, [page]: merged } };
}

/** Finalisation started: the converter left the sequential page loop. */
export function sweepFinalizing(state: SweepState): SweepState {
  if (state.status !== "running" || state.finalizing) return state;
  return { ...state, finalizing: true };
}

/** Apply a terminal outcome. Idempotent per status. */
export function sweepSettle(
  state: SweepState,
  status: Extract<SweepStatus, "complete" | "cancelled" | "failed">
): SweepState {
  if (state.status === status) return state;
  return { ...state, status };
}

/**
 * Derive a tile's state from the evidence, never from time.
 *
 * Proof order (strongest first):
 *  1. conversion completed            → everything is done
 *  2. finalising (page ≤ total)       → the loop finished this page
 *  3. an `after` thumbnail exists     → this page's transform ran
 *  4. a later start tick (page < N)   → the sequential loop moved past it
 *  5. current tick, still running     → this page is being swept right now
 *  6. current tick, terminal          → stopped mid-page
 *  7. no tick yet                     → queued (never claimed as converted)
 */
export function sweepTileState(state: SweepState, page: number): SweepTileState {
  if (state.status === "complete") return "done";
  if (state.finalizing && page <= state.total) return "done";
  if (state.previews[page]?.after) return "done";
  if (state.started > 0 && page < state.started) return "done";
  if (page === state.started && state.started > 0) {
    return state.status === "running" ? "sweeping" : "stopped";
  }
  return "queued";
}

/** How many pages are proven swept — the only number the UI may show. */
export function sweepDoneCount(state: SweepState): number {
  if (state.total <= 0) return 0;
  if (state.status === "complete") return state.total;
  if (state.finalizing) return state.total;
  let done = 0;
  for (let p = 1; p <= state.total; p++) {
    if (sweepTileState(state, p) === "done") done++;
  }
  return done;
}

/* ── Strip virtualisation ──────────────────────────────────────────────── */

/** Tile box width and horizontal pitch (width + gap), in CSS pixels. */
export const SWEEP_TILE_W = 72;
export const SWEEP_TILE_GAP = 6;
export const SWEEP_TILE_PITCH = SWEEP_TILE_W + SWEEP_TILE_GAP;
/** Tile height — matches the CSS aspect box. */
export const SWEEP_TILE_H = 96;
/** Extra tiles rendered on each side of the viewport. */
export const SWEEP_OVERSCAN = 6;

export interface SweepWindow {
  /** First tile index (0-based, inclusive). */
  start: number;
  /** End index (exclusive). */
  end: number;
}

/**
 * Which tile indices need DOM nodes for the given scroll position. Everything
 * outside the window is replaced by spacers of identical width, so a
 * 2000-page document mounts ~30 tiles instead of 2000.
 */
export function sweepWindow(
  total: number,
  scrollLeft: number,
  viewportWidth: number
): SweepWindow {
  if (total <= 0) return { start: 0, end: 0 };
  const visible = Math.ceil(viewportWidth / SWEEP_TILE_PITCH) + 1;
  const first = Math.floor(Math.max(0, scrollLeft) / SWEEP_TILE_PITCH);
  const start = Math.max(0, first - SWEEP_OVERSCAN);
  const end = Math.min(total, first + visible + SWEEP_OVERSCAN);
  return { start, end: Math.max(start, end) };
}
