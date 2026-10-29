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
    <div className="comparison-wrapper mt-6 p-4 rounded-2xl bg-[#0f1115] border border-zinc-800/80 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          {title}
        </span>
        <div className="flex items-center gap-1.5 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
          <button
            type="button"
            onClick={() => setViewMode("slider")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
              viewMode === "slider"
                ? "bg-purple-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Sweep Slider
          </button>
          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
              viewMode === "split"
                ? "bg-purple-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
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
    </div>
  );
}
