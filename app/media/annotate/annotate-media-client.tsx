"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Point = {
  x: number;
  y: number;
};

export function AnnotateMediaClient({
  imageSrc,
  imageName,
}: {
  imageSrc: string;
  imageName: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const [brushColor, setBrushColor] = useState("#ef4444");
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);

  const hasImage = useMemo(() => imageSrc.trim().length > 0, [imageSrc]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;

    if (!image || !canvas) {
      return;
    }

    function syncCanvas() {
      const width = image.clientWidth;
      const height = image.clientHeight;

      if (!width || !height) {
        return;
      }

      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    syncCanvas();
    window.addEventListener("resize", syncCanvas);
    return () => window.removeEventListener("resize", syncCanvas);
  }, [imageSrc]);

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = getPoint(event);

    if (!point) {
      return;
    }

    setIsDrawing(true);
    lastPointRef.current = point;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) {
      return;
    }

    const canvas = canvasRef.current;
    const point = getPoint(event);
    const lastPoint = lastPointRef.current;

    if (!canvas || !point || !lastPoint) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    context.strokeStyle = brushColor;
    context.lineWidth = brushSize;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }

  function handlePointerEnd() {
    setIsDrawing(false);
    lastPointRef.current = null;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function handleDownload() {
    const image = imageRef.current;
    const overlay = canvasRef.current;

    if (!image || !overlay) {
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = image.naturalWidth;
    exportCanvas.height = image.naturalHeight;
    const context = exportCanvas.getContext("2d");

    if (!context) {
      return;
    }

    context.drawImage(image, 0, 0, exportCanvas.width, exportCanvas.height);
    context.drawImage(overlay, 0, 0, exportCanvas.width, exportCanvas.height);

    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = `${imageName.replace(/\.[^.]+$/, "")}-annotated.png`;
    link.click();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
              Photo Annotation
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Edit Ticket Photo
            </h1>
            <p className="text-sm leading-7 text-slate-600">
              Draw on the image, then download the edited copy for sharing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={imageSrc || "#"}
              target="_blank"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Open Original
            </Link>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Clear Drawing
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Download Edited Copy
            </button>
          </div>
        </div>

        {hasImage ? (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                Colour
                <input
                  type="color"
                  value={brushColor}
                  onChange={(event) => setBrushColor(event.target.value)}
                  className="h-9 w-12 rounded border border-slate-300 bg-white"
                />
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                Brush
                <input
                  type="range"
                  min="2"
                  max="18"
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                />
                <span className="w-6 text-xs text-slate-500">{brushSize}</span>
              </label>
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-100 p-4">
              <div className="relative mx-auto w-full max-w-5xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt={imageName}
                  className="w-full rounded-2xl object-contain"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 touch-none rounded-2xl"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerEnd}
                  onPointerLeave={handlePointerEnd}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            No photo was provided to annotate.
          </div>
        )}
      </div>
    </main>
  );
}
