"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

interface ComparisonSliderProps {
  originalUrl: string;
  outputUrl: string;
  title?: string;
}

export function ComparisonSlider({
  originalUrl,
  outputUrl,
  title = "Interactive Before / After Preview",
}: ComparisonSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [sliderPos, setSliderPos] = useState(50); // percentage 0-100
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<"slider" | "split">("slider");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleMove = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    },
    [isDragging, handleMove]
  );

  return (
    <div className="comparison-wrapper">
      <div className="comparison-header">
        <span className="comparison-title">
          {title}
        </span>
        <div
          role="tablist"
          aria-label="Preview comparison mode"
          className="comparison-toggle-group"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "slider"}
            onClick={() => setViewMode("slider")}
            className={`comparison-toggle-btn ${viewMode === "slider" ? "is-active" : ""}`}
          >
            Sweep Slider
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "split"}
            onClick={() => setViewMode("split")}
            className={`comparison-toggle-btn ${viewMode === "split" ? "is-active" : ""}`}
          >
            Side-by-Side
          </button>
        </div>
      </div>

      {viewMode === "split" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[420px]">
          <div className="flex flex-col h-full rounded-xl border border-zinc-800 overflow-hidden bg-white/5">
            <span className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 bg-zinc-900 border-b border-zinc-800">
              Bright Original
            </span>
            <iframe
              src={originalUrl}
              title="Original document"
              className="flex-1 w-full h-full border-0"
            />
          </div>
          <div className="flex flex-col h-full rounded-xl border border-zinc-800 overflow-hidden bg-black">
            <span className="px-3 py-1.5 text-[11px] font-semibold text-purple-400 bg-zinc-900 border-b border-zinc-800">
              Dark Transformed
            </span>
            <iframe
              src={outputUrl}
              title="Converted dark document"
              className="flex-1 w-full h-full border-0"
            />
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setIsDragging(false)}
          onTouchMove={handleTouchMove}
          className="relative h-[420px] rounded-xl border border-zinc-800 overflow-hidden cursor-ew-resize select-none bg-black"
        >
          {/* Base: Transformed dark output (full width underneath) */}
          <iframe
            src={outputUrl}
            title="Dark converted preview"
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
          />

          {/* Overlaid: Original bright document clipped to sliderPos % */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none bg-white"
            style={{ width: `${sliderPos}%` }}
          >
            <iframe
              src={originalUrl}
              title="Bright original preview"
              className="w-full h-full border-0 pointer-events-none"
              style={{
                width: containerWidth ? `${containerWidth}px` : "100%",
              }}
            />
          </div>

          {/* Draggable Divider Handle */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-purple-500 shadow-lg shadow-purple-500/50 flex items-center justify-center pointer-events-none"
            style={{ left: `${sliderPos}%` }}
          >
            <div className="w-7 h-7 rounded-full bg-purple-600 border-2 border-white shadow-xl flex items-center justify-center text-white text-[10px] font-bold">
              ↔
            </div>
          </div>

          {/* Legend badges */}
          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 backdrop-blur-md text-[10px] font-medium text-white border border-white/10 pointer-events-none">
            Original
          </div>
          <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/70 backdrop-blur-md text-[10px] font-medium text-purple-400 border border-purple-500/30 pointer-events-none">
            Noctra Dark
          </div>
        </div>
      )}

      <style jsx>{`
        .comparison-wrapper {
          margin-top: 24px;
          padding: 16px 20px;
          border-radius: 16px;
          background: #0f1115;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        }
        .comparison-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 14px;
          padding-right: 2px;
        }
        .comparison-title {
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #d4d4d8;
          user-select: none;
        }
        .comparison-toggle-group {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 3px;
          background: #181920;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
          flex-shrink: 0;
        }
        .comparison-toggle-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          padding: 0 14px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: #9ca3af;
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          line-height: 1;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          flex-shrink: 0;
          transition: color 150ms ease, background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
        }
        .comparison-toggle-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.05);
        }
        .comparison-toggle-btn.is-active {
          background: #7c6dff;
          border-color: rgba(255, 255, 255, 0.12);
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(124, 109, 255, 0.4);
        }
        @media (max-width: 640px) {
          .comparison-wrapper {
            padding: 12px;
          }
          .comparison-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
            padding-right: 0;
          }
          .comparison-toggle-group {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
          }
          .comparison-toggle-btn {
            width: 100%;
            padding: 0 8px;
          }
        }
      `}</style>
    </div>
  );
}
