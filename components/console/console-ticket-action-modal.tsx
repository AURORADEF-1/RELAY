"use client";

import { useState } from "react";
import type { ConsoleTicket } from "@/lib/console-tickets";
import { notifyRequesterStatusChanged } from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { ticketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

export type ConsoleTicketAction = {
  mode: "note" | "status";
  ticket: ConsoleTicket;
};

export function ConsoleTicketActionModal({
  action,
  onClose,
  onSaved,
}: {
  action: ConsoleTicketAction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!action) {
    return null;
  }

  const { ticket, mode } = action;
  const normalizedStatus = nextStatus || ticket.status || "PENDING";

  function handleReview() {
    setErrorMessage("");
    if (mode === "note" && !note.trim()) {
      setErrorMessage("Enter a note before continuing.");
      return;
    }

    if (mode === "status") {
      if (normalizedStatus === ticket.status) {
        setErrorMessage("Choose a different status.");
        return;
      }
      if (normalizedStatus === "READY" && !ticket.bin_location?.trim()) {
        setErrorMessage("Add a bin location in the ticket editor before marking this job READY.");
        return;
      }
      if (
        normalizedStatus === "ORDERED" &&
        (!ticket.expected_delivery_date || !ticket.purchase_order_number?.trim() || !ticket.supplier_name?.trim())
      ) {
        setErrorMessage("Expected date, PO number and supplier are required before marking this job ORDERED.");
        return;
      }
    }

    setIsReviewing(true);
  }

  async function handleConfirm() {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");

    try {
      const { user, profile, isAdmin } = await getCurrentUserWithRole(supabase, { forceFresh: true });
      if (!user || !isAdmin) {
        throw new Error("Admin access is required.");
      }

      const actorName = profile?.display_name?.trim() || user.email?.split("@")[0] || "Administrator";
      if (mode === "note") {
        const { error } = await supabase.from("ticket_updates").insert({
          ticket_id: ticket.id,
          comment: `Admin note by ${actorName}: ${note.trim()}`,
        });
        if (error) {
          throw new Error(error.message);
        }
      } else {
        const updatedAt = new Date().toISOString();
        const { error: ticketError } = await supabase
          .from("tickets")
          .update({ status: normalizedStatus, updated_at: updatedAt })
          .eq("id", ticket.id);
        if (ticketError) {
          throw new Error(ticketError.message);
        }

        const { error: updateError } = await supabase.from("ticket_updates").insert({
          ticket_id: ticket.id,
          status: normalizedStatus,
          comment: `Status updated from ${ticket.status || "PENDING"} to ${normalizedStatus} by ${actorName}.`,
        });
        if (updateError) {
          throw new Error(updateError.message);
        }

        try {
          await notifyRequesterStatusChanged(supabase, {
            userId: ticket.user_id,
            ticketId: ticket.id,
            jobNumber: ticket.job_number,
            nextStatus: normalizedStatus,
            requestSummary: ticket.request_summary ?? ticket.request_details,
            assignedTo: ticket.assigned_to,
            binLocation: ticket.bin_location,
          });
        } catch (notificationError) {
          console.error("Failed to notify requester about quick status change", notificationError);
        }
      }

      onSaved();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this change.");
      setIsReviewing(false);
    } finally {
      setIsSaving(false);
    }
  }

  const confirmationText = mode === "note"
    ? "Are you sure you want to add this note to the permanent activity chain?"
    : normalizedStatus === "COMPLETED"
      ? "Are you sure you want to mark this request COMPLETED? It will leave the active operations queue."
      : `Are you sure you want to change this job from ${ticket.status || "PENDING"} to ${normalizedStatus}?`;

  return (
    <div className="console-action-modal-scrim" role="presentation">
      <section className="console-action-modal" role="dialog" aria-modal="true" aria-label={mode === "note" ? "Add note" : "Change status"}>
        <div className="console-action-modal-heading">
          <div>
            <p>Job {ticket.job_number || "—"}</p>
            <h2>{mode === "note" ? "Add activity note" : "Change job status"}</h2>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        {isReviewing ? (
          <div className="console-action-confirmation">
            <strong>Confirm change</strong>
            <p>{confirmationText}</p>
            <div>
              <button type="button" onClick={() => setIsReviewing(false)} disabled={isSaving}>Go back</button>
              <button type="button" onClick={() => void handleConfirm()} disabled={isSaving}>
                {isSaving ? "Saving..." : "Yes, confirm"}
              </button>
            </div>
          </div>
        ) : mode === "note" ? (
          <label className="console-action-field">
            <span>Admin note</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="Add a concise operational update" />
          </label>
        ) : (
          <label className="console-action-field">
            <span>New status</span>
            <select value={normalizedStatus} onChange={(event) => setNextStatus(event.target.value)}>
              {ticketStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        )}

        {errorMessage ? <p className="console-action-error">{errorMessage}</p> : null}
        {!isReviewing ? (
          <div className="console-action-modal-footer">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" onClick={handleReview}>Review change</button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
