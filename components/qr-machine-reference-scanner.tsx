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
        className="aurora-button-secondary w-full sm:w-auto"
      >
        Scan Machine QR
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[1.75rem] border border-[color:var(--border-strong)] bg-[color:var(--background-panel)] p-5 shadow-[0_32px_90px_-38px_rgba(0,0,0,0.68)] backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--foreground-subtle)]">
                  QR Intake
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground-strong)]">
                  Scan Machine Reference
                </h2>
                <p className="mt-2 text-sm leading-6 text-[color:var(--foreground-muted)]">
                  Point the camera at a QR code containing{" "}
                  <span className="font-semibold text-[color:var(--foreground-strong)]">
                    Machine Reference XXXXX
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={closeScanner}
                className="rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--foreground-subtle)] transition hover:bg-[color:var(--accent-soft)] hover:text-[color:var(--foreground-strong)]"
              >
                Close
              </button>
            </div>

            {!scannedMachineReference ? (
              <div className="mt-5 space-y-4">
                <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--border)] bg-black">
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
                  <div className="rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] px-4 py-3 text-sm text-[color:var(--foreground-muted)]">
                    Opening camera...
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="aurora-alert aurora-alert-error">
                    {errorMessage}
                  </div>
                ) : (
                  <div className="rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--background-muted)] px-4 py-3 text-sm text-[color:var(--foreground-muted)]">
                    The scanner will keep reading frames until it finds a valid machine reference QR code.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-[1.5rem] border border-[color:var(--success)] bg-[color:var(--success-soft)] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--success)]">
                  Machine Detected
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground-strong)]">
                  {scannedMachineReference}
                </p>
                <p className="mt-3 text-sm leading-6 text-[color:var(--foreground-muted)]">
                  Use this machine reference to prefill the parts request form.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleUseMachineReference}
                    className="aurora-button"
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
                    className="aurora-button-secondary"
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
