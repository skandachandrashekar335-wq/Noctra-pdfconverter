"use client";

/**
 * The Dark Sweep — the live light→dark conversion strip.
 *
 * A horizontal row of page tiles sits under the progress bar. Every tile
 * state comes from real conversion events (see `lib/dark-sweep.ts`): a tile
 * only darkens when the converter proved that specific page finished — a
 * later start tick, a transformed thumbnail, the finalising phase, or
 * successful completion. Nothing here runs on timers, and no percentage is
 * invented: the sweep simply tells the truth about which pages have been
 * swept to dark so far.
 *
 * For PDFs the tiles show *real* thumbnails captured from the render canvas
 * (light page → dark page). Formats with nothing to photograph (DOCX/PPTX)
 * get honest skeleton tiles in the same states — never fake page content.
 *
 * Virtualised: only the tiles inside the viewport (plus overscan) mount, so
 * a 2000-page document costs ~30 DOM nodes. The strip follows the in-flight
 * page automatically, but only when it has scrolled out of view.
 *
 * Reduced motion: the travelling wipe is dropped entirely; the in-flight
 * tile is marked with a static outline instead.
 *
 * Thumbnails are real buttons: clicking one opens a page preview modal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SWEEP_TILE_GAP,
  SWEEP_TILE_H,
  SWEEP_TILE_PITCH,
  SWEEP_TILE_W,
  sweepDoneCount,
  sweepTileState,
  sweepWindow,
  type SweepState,
  type SweepTileState,
} from "@/lib/dark-sweep";
import { useMemo } from "react";

interface DarkSweepProps {
  sweep: SweepState;
  /** Unit noun for this document type: page / slide / part. */
  noun: "page" | "slide" | "part";
}

const TILE_STATE_COPY: Record<SweepTileState, string> = {
  queued: "queued",
  sweeping: "sweeping to dark",
  stopped: "stopped",
  done: "swept to dark",
};

function summaryText(sweep: SweepState, noun: string) {
  const plural = `${noun}s`;
  const done = sweepDoneCount(sweep);
  const { total, status } = sweep;
  if (total <= 0) return "Reading document…";
  if (status === "cancelled" || status === "failed") {
    return `Sweep stopped — ${done} of ${total} ${plural} swept to dark`;
  }
  if (status === "complete" || sweep.finalizing) {
    return `All ${total} ${plural} swept to dark`;
  }
  return `${done} of ${total} ${plural} swept to dark`;
}

// ─── Preview modal ──────────────────────────────────────────────────────

function PreviewModal({
  isOpen,
  onClose,
  onPageSelect,
  total,
  currentPage,
  previews,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPageSelect: (page: number) => void;
  total: number;
  currentPage?: number;
  previews: Readonly<Record<number, { before?: string; after?: string }>>;
}) {
  // Hooks are always called at top level — the early return below
  // does not skip hook registration.
  const [focusedPage, setFocusedPage] = useState(currentPage ?? 1);

  // Trap focus in the modal while open
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const newPage = focusedPage - 1 <= 0 ? total : focusedPage - 1;
        setFocusedPage(newPage);
        onPageSelect(newPage);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const newPage = focusedPage + 1 > total ? 1 : focusedPage + 1;
        setFocusedPage(newPage);
        onPageSelect(newPage);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, onPageSelect, total, focusedPage]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Early return when modal is closed — hooks already registered above.
  if (!isOpen) return null;

  return (
    <div
      className="preview-modal"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-title"
    >
      <div className="preview-modal-inner" onClick={(e) => e.stopPropagation()}>
        <h2 id="preview-title" className="preview-modal-title">
          Page {focusedPage} of {total}
        </h2>

        <button
          className="preview-modal-close"
          aria-label="Close preview"
          onClick={onClose}
        >
          ×
        </button>

        <img
          className="preview-modal-img"
          src={previews[focusedPage]?.after ?? previews[focusedPage]?.before ?? ""}
          alt={`Page ${focusedPage} of ${total} preview`}
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = "/_next/static/invalid.png";
          }}
        />

        <div className="preview-modal-nav">
          <button
            className="preview-modal-nav-btn preview-modal-nav-prev"
            disabled={focusedPage === 1}
            aria-label="Previous page"
            onClick={(e) => {
              e.preventDefault();
              const newPage = focusedPage - 1 <= 0 ? total : focusedPage - 1;
              setFocusedPage(newPage);
              onPageSelect(newPage);
            }}
          >
            ←
          </button>
          <button
            className="preview-modal-nav-btn preview-modal-nav-next"
            disabled={focusedPage === total}
            aria-label="Next page"
            onClick={(e) => {
              e.preventDefault();
              const newPage = focusedPage + 1 > total ? 1 : focusedPage + 1;
              setFocusedPage(newPage);
              onPageSelect(newPage);
            }}
          >
            →
          </button>
        </div>

        <div className="preview-modal-footer">
          <span className="preview-modal-page">
            Page{" "}{focusedPage}{" of "}{total}
          </span>
        </div>
      </div>
    </div>
  );
}
PreviewModal.displayName = "PreviewModal";

// ─── DarkSweep component ────────────────────────────────────────────────

export function DarkSweep({ sweep, noun }: DarkSweepProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportW, setViewportW] = useState(0);

  const total = sweep.total;

  // Real viewport width for the window calculation.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    setViewportW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll position drives which tiles mount (rAF-throttled).
  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = stripRef.current;
      if (el) setScrollLeft(el.scrollLeft);
    });
  }, []);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // Follow the in-flight page — but only when it has scrolled out of view,
  // so the strip never fights a user who is inspecting another page.
  useEffect(() => {
    if (sweep.status !== "running" || total <= 0 || sweep.started <= 0) return;
    const el = stripRef.current;
    if (!el) return;
    const tileX = (sweep.started - 1) * SWEEP_TILE_PITCH;
    const inView =
      tileX >= el.scrollLeft && tileX + SWEEP_TILE_W <= el.scrollLeft + el.clientWidth;
    if (inView) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({
      left: Math.max(0, tileX - Math.floor(el.clientWidth / 3)),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [sweep.started, sweep.status, total]);

  const win = sweepWindow(total, scrollLeft, viewportW);

  // Plain data only — the <li> markup itself must be created inside the
  // returned JSX tree (see the .map() below). The styled-jsx transform only
  // hashes JSX elements it finds in this component's return expression:
  // tiles built here, or by a child component, silently miss every scoped
  // rule (both were measured unstyled in the browser before this split).
  const tiles: Array<{ page: number; state: SweepTileState; img?: string }> = [];
  for (let i = win.start; i < win.end; i++) {
    const page = i + 1;
    const preview = sweep.previews[page];
    tiles.push({
      page,
      state: sweepTileState(sweep, page),
      // Proof-based image choice: a transformed thumbnail (only present once
      // the page IS dark) wins; otherwise the real light page if captured;
      // otherwise the honest skeleton — never fabricated page content.
      img: preview?.after ?? preview?.before,
    });
  }

  const stopped = sweep.status === "cancelled" || sweep.status === "failed";

  // Preview modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPage, setModalPage] = useState(1);
  // Previews keyed by page, merged from before/after captures
  const previewsMap = useMemo(
    () => sweep.previews as Readonly<Record<number, { before?: string; after?: string }>>,
    [sweep.previews]
  );

  const openModal = (page: number) => {
    setModalPage(page);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const handlePageSelect = (page: number) => {
    setModalPage(page);
  };

  // Arrange focus return after close: try the tile that invoked the modal.
  useEffect(() => {
    if (!modalOpen && stripRef.current) {
      const firstTile = stripRef.current.querySelector('[role="button"]');
      if (firstTile) {
        ;(firstTile as HTMLElement).focus();
      }
    }
  }, [modalOpen]);

  return (
    <section className="sweep" aria-label="Dark Sweep progress">
      <div className="sweep-head">
        <p className="sweep-title">The Dark Sweep</p>
        <p className={`sweep-summary${stopped ? " sweep-summary--stopped" : ""}`}>
          {summaryText(sweep, noun)}
        </p>
      </div>
      {total > 0 && (
        // Visual detail for sighted users; the summary line above carries the
        // same information as text for everyone else.
        <div className="sweep-strip" ref={stripRef} onScroll={handleScroll}>
          <ul className="sweep-track" aria-hidden="true">
            {win.start > 0 && (
              <li
                className="sweep-spacer"
                style={{ width: win.start * SWEEP_TILE_PITCH }}
              />
            )}
            {tiles.map(({ page, state: tileState, img }) => (
              <li
                key={page}
                className={`sweep-tile sweep-tile--${tileState}`}
                style={{
                  width: SWEEP_TILE_W,
                  height: SWEEP_TILE_H,
                  marginRight: SWEEP_TILE_GAP,
                }}
                title={`${noun} ${page} — ${TILE_STATE_COPY[tileState]}`}
                onClick={() => openModal(page)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openModal(page);
                  }
                }}
                aria-label={`Page ${page} of ${total}`}
              >
                {img ? (
                  // Inline data: URL captured from the converter's own canvas —
                  // a 160px thumbnail that next/image has nothing to optimize
                  // (it cannot fetch or resize data URLs, and there is no CDN
                  // round-trip to save).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="sweep-tile-img"
                    src={img}
                    alt=""
                    draggable={false}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).src = "/_next/static/invalid.png";
                    }}
                  />
                ) : (
                  <span className="sweep-tile-skeleton" aria-hidden="true" />
                )}
                {tileState === "sweeping" && (
                  <span className="sweep-wipe" aria-hidden="true" />
                )}
                <span className="sweep-tile-num">{page}</span>
              </li>
            ))}
            {win.end < total && (
              <li
                className="sweep-spacer"
                style={{ width: (total - win.end) * SWEEP_TILE_PITCH }}
              />
            )}
          </ul>
        </div>
      )}
      <PreviewModal
        isOpen={modalOpen}
        onClose={closeModal}
        onPageSelect={handlePageSelect}
        total={total}
        currentPage={modalPage}
        previews={previewsMap}
      />
      <style jsx>{`
        .sweep {
          display: grid;
          gap: 10px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px dashed var(--border-subtle, rgba(255, 255, 255, 0.1));
        }
        .sweep-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        }
        .sweep-title {
          margin: 0;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .sweep-summary {
          margin: 0;
          font-size: 0.8125rem;
          color: var(--text-secondary);
          font-variant-numeric: tabular-nums;
          text-align: right;
        }
        .sweep-summary--stopped {
          color: #f59e0b;
        }
        .sweep-strip {
          position: relative;
          overflow-x: auto;
          overflow-y: hidden;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          padding-bottom: 6px;
        }
        .sweep-track {
          display: flex;
          align-items: flex-start;
          margin: 0;
          padding: 0;
          list-style: none;
          min-height: ${SWEEP_TILE_H}px;
        }
        .sweep-spacer {
          flex: 0 0 auto;
          align-self: stretch;
        }
        .sweep-tile {
          position: relative;
          flex: 0 0 auto;
          border-radius: 5px;
          overflow: hidden;
          background: #f6f1e7;
          box-shadow: inset 0 0 0 1px rgba(17, 17, 17, 0.1);
          cursor: pointer;
        }
        .sweep-tile-img {
          position: absolute;
          inset: 0;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
        }
        .sweep-tile-skeleton {
          position: absolute;
          inset: 9px 9px 24px;
          border-radius: 2px;
          background: repeating-linear-gradient(
            to bottom,
            #d8d1c2 0 2px,
            transparent 2px 8px
          );
        }
        .sweep-tile-num {
          position: absolute;
          right: 4px;
          bottom: 3px;
          padding: 0 3px;
          border-radius: 3px;
          font-size: 0.5625rem;
          font-weight: 700;
          line-height: 1.5;
          color: #6f695b;
          background: rgba(246, 241, 231, 0.88);
          font-variant-numeric: tabular-nums;
        }
        /* Proven-converted tiles: the real dark output (or dark skeleton). */
        .sweep-tile--done {
          background: #14141a;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        .sweep-tile--done .sweep-tile-skeleton {
          background: repeating-linear-gradient(
            to bottom,
            #2c2c38 0 2px,
            transparent 2px 8px
          );
        }
        .sweep-tile--done .sweep-tile-num {
          color: #b9b4a6;
          background: rgba(20, 20, 26, 0.85);
        }
        .sweep-tile--queued {
          opacity: 0.72;
        }
        .sweep-tile--stopped {
          box-shadow: inset 0 0 0 2px #f59e0b;
          filter: grayscale(0.4) brightness(0.9);
        }
        .sweep-wipe {
          position: absolute;
          inset: -45% -65%;
          background: linear-gradient(
            115deg,
            rgba(8, 8, 11, 0) 38%,
            rgba(8, 8, 11, 0.45) 47%,
            rgba(124, 109, 255, 0.4) 50%,
            rgba(8, 8, 11, 0.45) 53%,
            rgba(8, 8, 11, 0) 62%
          );
          transform: translateX(-70%);
        }
        @media (prefers-reduced-motion: no-preference) {
          .sweep-wipe {
            animation: sweep-wipe 1.1s ease-in-out infinite;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sweep-wipe {
            display: none;
          }
          .sweep-tile--sweeping {
            box-shadow: inset 0 0 0 2px #7c6dff;
          }
        }
        @keyframes sweep-wipe {
          0% {
            transform: translateX(-70%);
          }
          50% {
            transform: translateX(70%);
          }
          100% {
            transform: translateX(-70%);
          }
        }
      `}</style>
    </section>
  );
}