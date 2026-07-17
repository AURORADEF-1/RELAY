"use client";

import { useState } from "react";
import QRCode from "qrcode";
import {
  buildCollectionQrPayload,
  generateCollectionCode,
  issueTicketCollectionCode,
} from "@/lib/ticket-collection";
import { getSupabaseClient } from "@/lib/supabase";

export function RequesterCollectionCode({
  ticketId,
  jobNumber,
}: {
  ticketId: string;
  jobNumber: string | null;
}) {
  const [code, setCode] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleGenerate() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
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
  }

  if (!code || !qrDataUrl) {
    return (
      <div className="requester-collection-code">
        <div>
          <p>Collection verification</p>
          <span>Generate a QR or verbal code for the parts administrator.</span>
        </div>
        <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate QR or code"}
        </button>
        {errorMessage ? <strong>{errorMessage}</strong> : null}
      </div>
    );
  }

  return (
    <div className="requester-collection-code requester-collection-code-active">
      <div className="requester-collection-qr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`Collection QR for job ${jobNumber || ticketId}`} />
      </div>
      <div className="requester-collection-code-copy">
        <p>Collection code</p>
        <strong>{code}</strong>
        <span>Show the QR or read this code to the parts administrator.</span>
        {expiresAt ? <small>Valid until {new Date(expiresAt).toLocaleString("en-GB")}</small> : null}
        <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating}>
          Generate a new code
        </button>
      </div>
      {errorMessage ? <strong className="requester-collection-error">{errorMessage}</strong> : null}
    </div>
  );
}
