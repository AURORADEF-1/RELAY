"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

type QrMachineReferenceScannerProps = {
  onDetected: (machineReference: string) => void;
};

export function QrMachineReferenceScanner({
  onDetected,
}: QrMachineReferenceScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [scannedMachineReference, setScannedMachineReference] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);

  function stopScanner() {
    if (scanTimeoutRef.current !== null) {
      window.clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function openScanner() {
    setErrorMessage("");
    setScannedMachineReference("");
    setIsCameraLoading(false);
    setIsOpen(true);
  }

  function closeScanner() {
    stopScanner();
    setErrorMessage("");
    setScannedMachineReference("");
    setIsCameraLoading(false);
    setIsOpen(false);
  }

  function handleUseMachineReference() {
    if (!scannedMachineReference) {
      return;
    }

    onDetected(scannedMachineReference);
    closeScanner();
  }

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    let isCancelled = false;

    async function startScanner() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMessage("Camera access is not available on this device.");
        return;
      }

      setErrorMessage("");
      setScannedMachineReference("");
      setIsCameraLoading(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal: "environment",
            },
          },
          audio: false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = () => {
          if (
            isCancelled ||
            !videoRef.current ||
            !canvasRef.current ||
            videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
          ) {
            scanTimeoutRef.current = window.setTimeout(scanFrame, 250);
            return;
          }

          const video = videoRef.current;
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d", { willReadFrequently: true });

          if (!context) {
            setErrorMessage("Unable to read the camera frame for QR scanning.");
            setIsCameraLoading(false);
            return;
          }

          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);

          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const detected = jsQR(frame.data, frame.width, frame.height);
          const matchedReference = parseMachineReference(detected?.data);

          if (matchedReference) {
            stopScanner();
            setScannedMachineReference(matchedReference);
            setIsCameraLoading(false);
            return;
          }

          setIsCameraLoading(false);
          scanTimeoutRef.current = window.setTimeout(scanFrame, 250);
        };

        scanFrame();
      } catch {
        setErrorMessage("Camera permission was denied or the camera could not be opened.");
        setIsCameraLoading(false);
      }
    }

    void startScanner();

    return () => {
      isCancelled = true;
      stopScanner();
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={openScanner}
        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
      >
        Scan Machine QR
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/72 px-4 py-6">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.45)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  QR Intake
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  Scan Machine Reference
                </h2>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  Point the camera at a QR code containing <span className="font-semibold text-slate-950">Machine Reference XXXXX</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closeScanner}
                className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                Close
              </button>
            </div>

            {!scannedMachineReference ? (
              <div className="mt-5 space-y-4">
                <div className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-950">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="aspect-[4/3] w-full object-cover"
                  />
                </div>
                <canvas ref={canvasRef} className="hidden" />

                {isCameraLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Opening camera...
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    The scanner will keep reading frames until it finds a valid machine reference QR code.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-[1.5rem] border border-cyan-200 bg-cyan-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                  Machine Detected
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  {scannedMachineReference}
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  Use this machine reference to prefill the parts request form.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleUseMachineReference}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Use Machine Reference
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScannedMachineReference("");
                      setErrorMessage("");
                      setIsCameraLoading(false);
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Scan Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function parseMachineReference(rawValue?: string) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.replace(/\s+/g, " ").trim();
  const matchedReference = normalized.match(/^machine reference[:\s-]+(.+)$/i);

  if (!matchedReference) {
    return null;
  }

  return matchedReference[1]?.trim() || null;
}
