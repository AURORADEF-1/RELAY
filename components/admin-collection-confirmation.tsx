"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import {
  confirmTicketCollection,
  parseCollectionQrPayload,
} from "@/lib/ticket-collection";
import { getSupabaseClient } from "@/lib/supabase";

export function AdminCollectionConfirmation({
  ticketId,
  onConfirmed,
}: {
  ticketId: string;
  onConfirmed: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<"qr" | "code">("code");
  const [isScanning, setIsScanning] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  function stopScanner() {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsScanning(false);
  }

  useEffect(() => stopScanner, []);

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice("Camera scanning is not supported in this browser. Enter the code instead.");
      return;
    }

    setNotice("");
    setIsScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopScanner();
        return;
      }

      video.srcObject = stream;
      await video.play();
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      const scan = () => {
        if (!video.videoWidth || !video.videoHeight || !context) {
          frameRef.current = requestAnimationFrame(scan);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(frame.data, frame.width, frame.height);
        if (result) {
          const parsed = parseCollectionQrPayload(result.data);
          if (!parsed || parsed.ticketId !== ticketId) {
            setNotice("This QR code does not belong to this ticket.");
          } else {
            setCode(parsed.code);
            setMethod("qr");
            setNotice("QR read successfully. Confirm collection below.");
            stopScanner();
            return;
          }
        }
        frameRef.current = requestAnimationFrame(scan);
      };

      frameRef.current = requestAnimationFrame(scan);
    } catch {
      setNotice("Camera permission was denied. Enter the six-character code instead.");
      stopScanner();
    }
  }

  async function handleConfirm() {
    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      setNotice("Enter the six-character collection code.");
      return;
    }

    if (!window.confirm("Are you sure you want to confirm that this part has been collected?")) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setNotice("Supabase environment variables are not configured.");
      return;
    }

    setIsConfirming(true);
    setNotice("");
    try {
      await confirmTicketCollection(supabase, ticketId, normalizedCode, method);
      setNotice("Collection confirmed and recorded.");
      onConfirmed();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to confirm collection.");
    } finally {
      setIsConfirming(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="admin-confirm-collection-trigger" onClick={() => setIsOpen(true)}>
        Confirm collection
      </button>
    );
  }

  return (
    <section className="admin-collection-confirmation">
      <div className="admin-collection-confirmation-heading">
        <div>
          <p>Confirm collection</p>
          <span>Scan the requester QR or enter the verbal code.</span>
        </div>
        <button type="button" onClick={() => { stopScanner(); setIsOpen(false); }}>Close</button>
      </div>
      {isScanning ? <video ref={videoRef} muted playsInline className="admin-collection-video" /> : <video ref={videoRef} muted playsInline className="hidden" />}
      <div className="admin-collection-controls">
        <input
          value={code}
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setMethod("code"); }}
          maxLength={6}
          placeholder="ABC234"
          aria-label="Collection code"
        />
        <button type="button" onClick={() => isScanning ? stopScanner() : void startScanner()}>
          {isScanning ? "Stop camera" : "Scan QR"}
        </button>
        <button type="button" onClick={() => void handleConfirm()} disabled={isConfirming}>
          {isConfirming ? "Confirming..." : "Verify collection"}
        </button>
      </div>
      {notice ? <p className="admin-collection-notice">{notice}</p> : null}
    </section>
  );
}
