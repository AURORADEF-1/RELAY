"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CollectionCodeBarcode } from "@/components/collection-code-barcode";
import {
  buildCollectionQrPayload,
  generateCollectionCode,
  issueTicketCollectionCode,
} from "@/lib/ticket-collection";
import { getSupabaseClient } from "@/lib/supabase";

export function RequesterCollectionCode({
  ticketId,
  jobNumber,
  binLocation,
  requestSummary,
}: {
  ticketId: string;
  jobNumber: string | null;
  binLocation?: string | null;
  requestSummary?: string | null;
}) {
  const [code, setCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isGenerating, setIsGenerating] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const hasStartedAutomatically = useRef(false);

  const handleGenerate = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    setErrorMessage("");

    try {
      const nextCode = generateCollectionCode();
      const issued = await issueTicketCollectionCode(supabase, ticketId, nextCode);
      const dataUrl = await QRCode.toDataURL(buildCollectionQrPayload(ticketId, nextCode), {
        width: 320,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      setCode(nextCode);
      setQrDataUrl(dataUrl);
      setExpiresAt(issued?.expires_at ?? "");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to generate a collection code.");
    } finally {
      setIsGenerating(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (hasStartedAutomatically.current) return;
    hasStartedAutomatically.current = true;
    void handleGenerate();
  }, [handleGenerate]);

  if (!code || !qrDataUrl) {
    return (
      <div className="requester-collection-code">
        <div>
          <p>Preparing collection pass</p>
          <span>Your secure QR and scanner code are being generated.</span>
        </div>
        <span className="requester-collection-loading" aria-hidden="true" />
        {!isGenerating ? (
          <button type="button" onClick={() => void handleGenerate()}>
            Try again
          </button>
        ) : null}
        {errorMessage ? <strong>{errorMessage}</strong> : null}
      </div>
    );
  }

  return (
    <div className="requester-collection-code requester-collection-code-active">
      <div className="requester-collection-heading">
        <div>
          <p>Ready to collect</p>
          <strong>Job {jobNumber?.trim() || "—"}</strong>
        </div>
        {binLocation?.trim() ? <span>Collect from bin {binLocation.trim()}</span> : null}
      </div>
      {requestSummary?.trim() ? (
        <p className="requester-collection-summary">{requestSummary.trim()}</p>
      ) : null}
      <div className="requester-collection-pass">
        <div className="requester-collection-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt={`Collection QR for job ${jobNumber || ticketId}`} />
        </div>
        <div className="requester-collection-code-copy">
          <p>Collection code</p>
          <strong>{code}</strong>
          <span>Show this screen to Stores. They can scan either code or enter the six characters.</span>
          {expiresAt ? <small>Valid until {new Date(expiresAt).toLocaleString("en-GB")}</small> : null}
        </div>
      </div>
      <CollectionCodeBarcode value={code} />
      <button
        type="button"
        className="requester-collection-refresh"
        onClick={() => void handleGenerate()}
        disabled={isGenerating}
      >
        {isGenerating ? "Refreshing…" : "Refresh collection pass"}
      </button>
      {errorMessage ? <strong className="requester-collection-error">{errorMessage}</strong> : null}
    </div>
  );
}
