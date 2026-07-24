"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ConsoleTicket } from "@/lib/console-tickets";
import {
  fetchAdminAssigneeOptions,
  getAdminAssignmentLabel,
  type AdminAssigneeOption,
} from "@/lib/admin-assignees";
import {
  notifyAdminJobAssigned,
  notifyRequesterStatusChanged,
} from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { ticketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";

export type ConsoleTicketAction = {
  mode: "note" | "status";
  ticket: ConsoleTicket;
};

export type ConsoleTicketActionSaved = {
  assigneeLabel: string;
  jobNumber: string;
  mode: ConsoleTicketAction["mode"];
};

export function ConsoleTicketActionModal({
  action,
  onClose,
  onSaved,
}: {
  action: ConsoleTicketAction | null;
  onClose: () => void;
  onSaved: (result: ConsoleTicketActionSaved) => void;
}) {
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [assignees, setAssignees] = useState<AdminAssigneeOption[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [currentActorLabel, setCurrentActorLabel] = useState("");
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const headingId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!action) return;

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = [
      "button:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>("[data-modal-close]")?.focus();
    });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocusedElementRef.current?.focus();
    };
  }, [action]);

  useEffect(() => {
    if (!action) return;
    let isMounted = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsLoadingAssignees(true);
    void getCurrentUserWithRole(supabase, { forceFresh: true })
      .then(async ({ user, profile, isAdmin }) => {
        if (!user || !isAdmin) throw new Error("Admin access is required.");
        const displayName = profile?.display_name?.trim()
          || user.email?.split("@")[0]
          || "Administrator";
        const actorLabel = getAdminAssignmentLabel(displayName);
        let options: AdminAssigneeOption[];
        try {
          options = await fetchAdminAssigneeOptions(supabase, { user, displayName });
        } catch {
          options = [{
            userId: user.id,
            label: actorLabel,
            fullName: displayName,
            isCurrentUser: true,
          }];
        }
        if (!isMounted) return;
        setAssignees(options);
        setSelectedAssigneeId(user.id);
        setCurrentActorLabel(actorLabel);
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load admin users.");
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingAssignees(false);
      });

    return () => {
      isMounted = false;
    };
  }, [action]);

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
      if (!selectedAssigneeId || isLoadingAssignees) {
        setErrorMessage("Wait for the admin assignment list to load.");
        return;
      }
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
      const latestAssignees = await fetchAdminAssigneeOptions(supabase, {
        user,
        displayName: actorName,
      });
      const selectedUserId = mode === "note" ? user.id : selectedAssigneeId;
      const assignee = latestAssignees.find((option) => option.userId === selectedUserId);
      if (!assignee) {
        throw new Error("The selected admin is no longer available for assignment.");
      }
      const assignmentChanged = ticket.assigned_to?.trim().toLowerCase()
        !== assignee.label.toLowerCase();
      const updatedAt = new Date().toISOString();

      if (mode === "note") {
        if (assignmentChanged) {
          const { error: assignmentError } = await supabase
            .from("tickets")
            .update({ assigned_to: assignee.label, updated_at: updatedAt })
            .eq("id", ticket.id);
          if (assignmentError) {
            throw new Error(assignmentError.message);
          }
        }

        const { error } = await supabase.from("ticket_updates").insert({
          ticket_id: ticket.id,
          comment: `Admin note by ${actorName}: ${note.trim()}${assignmentChanged ? ` Job assigned to ${assignee.label}.` : ""}`,
        });
        if (error) {
          throw new Error(error.message);
        }
      } else {
        const { error: ticketError } = await supabase
          .from("tickets")
          .update({
            status: normalizedStatus,
            assigned_to: assignee.label,
            updated_at: updatedAt,
          })
          .eq("id", ticket.id);
        if (ticketError) {
          throw new Error(ticketError.message);
        }

        const { error: updateError } = await supabase.from("ticket_updates").insert({
          ticket_id: ticket.id,
          status: normalizedStatus,
          comment: `Status updated from ${ticket.status || "PENDING"} to ${normalizedStatus} by ${actorName}.${assignmentChanged ? ` Job assigned to ${assignee.label}.` : ""}`,
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
            assignedTo: assignee.label,
            binLocation: ticket.bin_location,
          });
        } catch (notificationError) {
          console.error("Failed to notify requester about quick status change", notificationError);
        }
      }

      if (assignmentChanged && assignee.userId !== user.id) {
        try {
          await notifyAdminJobAssigned(supabase, {
            userId: assignee.userId,
            ticketId: ticket.id,
            jobNumber: ticket.job_number?.trim() || ticket.id.slice(0, 8),
            requestSummary:
              ticket.request_summary?.trim()
              || ticket.request_details?.trim()
              || "Request details not recorded",
            assignedBy: actorName,
          });
        } catch (notificationError) {
          console.error("Failed to notify reassigned admin", notificationError);
        }
      }

      onSaved({
        assigneeLabel: assignee.label,
        jobNumber: ticket.job_number?.trim() || ticket.id.slice(0, 8),
        mode,
      });
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this change.");
      setIsReviewing(false);
    } finally {
      setIsSaving(false);
    }
  }

  const confirmationText = mode === "note"
    ? `Add this note to the permanent activity chain and assign the job to ${currentActorLabel || "you"}?`
    : normalizedStatus === "COMPLETED"
      ? `Mark this request COMPLETED and assign it to ${assignees.find((option) => option.userId === selectedAssigneeId)?.label || "the selected admin"}? It will leave the active operations queue.`
      : `Change this job from ${ticket.status || "PENDING"} to ${normalizedStatus} and assign it to ${assignees.find((option) => option.userId === selectedAssigneeId)?.label || "the selected admin"}?`;

  return (
    <div className="console-action-modal-scrim" role="presentation">
      <section
        ref={dialogRef}
        className="console-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <div className="console-action-modal-heading">
          <div>
            <p>Job {ticket.job_number || "—"}</p>
            <h2 id={headingId}>{mode === "note" ? "Add activity note" : "Change job status"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" data-modal-close>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="console-action-modal-body">
          {isReviewing ? (
            <div className="console-action-confirmation">
              <strong>Confirm change</strong>
              <p>{confirmationText}</p>
            </div>
          ) : mode === "note" ? (
            <>
              <div className="console-action-assignment-callout">
                <span>Automatic assignment</span>
                <strong>{currentActorLabel || "Loading signed-in admin..."}</strong>
                <p>Adding this note assigns the job to the signed-in admin.</p>
              </div>
              <label className="console-action-field">
                <span>Admin note</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder="Add a concise operational update" />
              </label>
            </>
          ) : (
            <div className="console-action-field-grid">
              <label className="console-action-field">
                <span>New status</span>
                <select value={normalizedStatus} onChange={(event) => setNextStatus(event.target.value)}>
                  {ticketStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label className="console-action-field">
                <span>Assign to</span>
                <select
                  value={selectedAssigneeId}
                  onChange={(event) => setSelectedAssigneeId(event.target.value)}
                  disabled={isLoadingAssignees}
                >
                  {assignees.map((assignee) => (
                    <option key={assignee.userId} value={assignee.userId}>
                      {assignee.isCurrentUser ? `Me · ${assignee.label}` : assignee.label}
                    </option>
                  ))}
                </select>
                <small>
                  Currently {ticket.assigned_to?.trim() || "unassigned"}. Status changes default to you.
                </small>
              </label>
            </div>
          )}

          {errorMessage ? <p className="console-action-error" role="alert">{errorMessage}</p> : null}
        </div>

        <div className="console-action-modal-footer">
          {isReviewing ? (
            <>
              <button type="button" onClick={() => setIsReviewing(false)} disabled={isSaving}>Go back</button>
              <button type="button" onClick={() => void handleConfirm()} disabled={isSaving}>
                {isSaving ? "Saving..." : "Yes, confirm"}
              </button>
            </>
          ) : (
            <>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" onClick={handleReview} disabled={isLoadingAssignees}>
              {isLoadingAssignees ? "Loading admins..." : "Review change"}
            </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
