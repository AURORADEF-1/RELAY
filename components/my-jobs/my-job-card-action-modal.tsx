"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  fetchAdminAssigneeOptions,
  type AdminAssigneeOption,
} from "@/lib/admin-assignees";
import type { MyJobTicket } from "@/lib/my-jobs";
import {
  notifyAdminJobAssigned,
  notifyRequesterStatusChanged,
} from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type ActionStage = "menu" | "complete" | "reassign";

export function MyJobCardActionModal({
  ticket,
  operatorLabel,
  onClose,
  onSaved,
}: {
  ticket: MyJobTicket | null;
  operatorLabel: string;
  onClose: () => void;
  onSaved: (ticket: MyJobTicket) => void;
}) {
  const [stage, setStage] = useState<ActionStage>("menu");
  const [note, setNote] = useState("");
  const [assignees, setAssignees] = useState<AdminAssigneeOption[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("");
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const headingId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!ticket) return;
    setStage("menu");
    setNote("");
    setAssignees([]);
    setSelectedAssigneeId("");
    setErrorMessage("");

    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    const timeoutId = window.setTimeout(() => dialogRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [ticket]);

  useEffect(() => {
    if (!ticket || stage !== "reassign") return;
    let isMounted = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsLoadingAssignees(true);
    setErrorMessage("");
    void getCurrentUserWithRole(supabase, { forceFresh: true })
      .then(async ({ user, profile, isAdmin }) => {
        if (!user || !isAdmin) throw new Error("Admin access is required.");
        const displayName =
          profile?.display_name?.trim() ||
          user.email?.split("@")[0] ||
          operatorLabel;
        const options = await fetchAdminAssigneeOptions(supabase, {
          user,
          displayName,
        });
        if (!isMounted) return;
        setAssignees(options);
        const currentAssignee = options.find(
          (option) =>
            option.label.toLowerCase() ===
            ticket.assigned_to?.trim().toLowerCase(),
        );
        const nextAssignee = options.find(
          (option) => option.userId !== currentAssignee?.userId,
        );
        setSelectedAssigneeId(nextAssignee?.userId ?? "");
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load admin users.",
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingAssignees(false);
      });

    return () => {
      isMounted = false;
    };
  }, [operatorLabel, stage, ticket]);

  if (!ticket) return null;

  async function completeJob(activeTicket: MyJobTicket) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      const { user, profile, isAdmin } = await getCurrentUserWithRole(
        supabase,
        { forceFresh: true },
      );
      if (!user || !isAdmin) throw new Error("Admin access is required.");
      const actorName =
        profile?.display_name?.trim() ||
        user.email?.split("@")[0] ||
        operatorLabel;
      const actorLabel = operatorLabel || actorName;
      const changedAt = new Date().toISOString();

      let query = supabase
        .from("tickets")
        .update({ status: "COMPLETED", updated_at: changedAt })
        .eq("id", activeTicket.id);
      if (activeTicket.updated_at)
        query = query.eq("updated_at", activeTicket.updated_at);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data)
        throw new Error(
          "This job changed in another session. Refresh and try again.",
        );

      const completionNote = note.trim();
      const { error: updateError } = await supabase
        .from("ticket_updates")
        .insert({
          ticket_id: activeTicket.id,
          status: "COMPLETED",
          comment: `Job completed by ${actorLabel}.${completionNote ? ` Completion note: ${completionNote}` : ""}`,
        });
      if (updateError) throw new Error(updateError.message);

      if (!activeTicket.is_retail_sale) {
        try {
          await notifyRequesterStatusChanged(supabase, {
            userId: activeTicket.user_id,
            ticketId: activeTicket.id,
            jobNumber: activeTicket.job_number,
            nextStatus: "COMPLETED",
            requestSummary:
              activeTicket.request_summary ?? activeTicket.request_details,
            assignedTo: activeTicket.assigned_to,
            binLocation: activeTicket.bin_location,
          });
        } catch (notificationError) {
          console.error(
            "Failed to notify requester about completed My Job",
            notificationError,
          );
        }
      }

      onSaved({ ...activeTicket, ...data, status: "COMPLETED" } as MyJobTicket);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to complete this job.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function reassignJob(activeTicket: MyJobTicket) {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }
    if (!selectedAssigneeId || isLoadingAssignees) {
      setErrorMessage("Choose an admin user before reassigning this job.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      const { user, profile, isAdmin } = await getCurrentUserWithRole(
        supabase,
        { forceFresh: true },
      );
      if (!user || !isAdmin) throw new Error("Admin access is required.");
      const actorName =
        profile?.display_name?.trim() ||
        user.email?.split("@")[0] ||
        operatorLabel;
      const actorLabel = operatorLabel || actorName;
      const latestAssignees = await fetchAdminAssigneeOptions(supabase, {
        user,
        displayName: actorName,
      });
      const assignee = latestAssignees.find(
        (option) => option.userId === selectedAssigneeId,
      );
      if (!assignee)
        throw new Error("The selected admin is no longer available.");
      if (
        assignee.label.toLowerCase() ===
        activeTicket.assigned_to?.trim().toLowerCase()
      ) {
        throw new Error(`This job is already assigned to ${assignee.label}.`);
      }

      const changedAt = new Date().toISOString();
      let query = supabase
        .from("tickets")
        .update({ assigned_to: assignee.label, updated_at: changedAt })
        .eq("id", activeTicket.id);
      if (activeTicket.updated_at)
        query = query.eq("updated_at", activeTicket.updated_at);
      const { data, error } = await query.select("*").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data)
        throw new Error(
          "This job changed in another session. Refresh and try again.",
        );

      const { error: updateError } = await supabase
        .from("ticket_updates")
        .insert({
          ticket_id: activeTicket.id,
          comment: `Job reassigned from ${activeTicket.assigned_to?.trim() || "Unassigned"} to ${assignee.label} by ${actorLabel}.`,
        });
      if (updateError) throw new Error(updateError.message);

      await notifyAdminJobAssigned(supabase, {
        userId: assignee.userId,
        ticketId: activeTicket.id,
        jobNumber:
          activeTicket.job_number?.trim() || activeTicket.id.slice(0, 8),
        requestSummary:
          activeTicket.request_summary?.trim() ||
          activeTicket.request_details?.trim() ||
          "Request details not recorded",
        assignedBy: actorLabel,
      });

      onSaved({
        ...activeTicket,
        ...data,
        assigned_to: assignee.label,
      } as MyJobTicket);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to reassign this job.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const jobLabel = ticket.job_number || ticket.id.slice(0, 8);

  return (
    <div
      className="my-jobs-modal-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="my-jobs-modal my-job-action-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <header>
          <div>
            <p>Ticket actions</p>
            <h2 id={headingId}>JOB {jobLabel}</h2>
            <span>
              {ticket.request_summary?.trim() ||
                ticket.request_details?.trim() ||
                "Request details not recorded"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close ticket actions"
          >
            ×
          </button>
        </header>

        <div className="my-jobs-modal-body">
          {stage === "menu" ? (
            <div className="my-job-action-choices">
              <button type="button" onClick={() => setStage("complete")}>
                <span aria-hidden="true">✓</span>
                <strong>Complete job</strong>
                <small>Close the job and move it to Completed work.</small>
              </button>
              <button type="button" onClick={() => setStage("reassign")}>
                <span aria-hidden="true">→</span>
                <strong>Reassign job</strong>
                <small>Move this ticket to another RELAY admin user.</small>
              </button>
            </div>
          ) : null}

          {stage === "complete" ? (
            <>
              <div className="my-job-action-confirmation">
                <strong>Complete JOB {jobLabel}?</strong>
                <p>
                  It will leave your active board and appear under View
                  completed.
                </p>
              </div>
              <label className="my-jobs-field">
                <span>
                  Completion note <em>optional</em>
                </span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What was completed?"
                />
              </label>
            </>
          ) : null}

          {stage === "reassign" ? (
            <label className="my-jobs-field">
              <span>Assign to</span>
              <select
                value={selectedAssigneeId}
                onChange={(event) => setSelectedAssigneeId(event.target.value)}
                disabled={isLoadingAssignees}
              >
                <option value="">
                  {isLoadingAssignees
                    ? "Loading admin users…"
                    : "Choose admin user"}
                </option>
                {assignees.map((assignee) => (
                  <option key={assignee.userId} value={assignee.userId}>
                    {assignee.isCurrentUser
                      ? `Me · ${assignee.label}`
                      : assignee.label}
                  </option>
                ))}
              </select>
              <small className="my-job-action-field-help">
                The selected admin receives a RELAY notification showing that{" "}
                {operatorLabel || "the current operator"} assigned the job.
              </small>
            </label>
          ) : null}

          {errorMessage ? (
            <div className="my-jobs-modal-error" role="alert">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <footer>
          {stage === "menu" ? (
            <button
              type="button"
              className="my-jobs-button-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                className="my-jobs-button-secondary"
                onClick={() => {
                  setStage("menu");
                  setErrorMessage("");
                }}
                disabled={isSaving}
              >
                Back
              </button>
              <button
                type="button"
                className="my-jobs-button-primary"
                onClick={() =>
                  void (stage === "complete"
                    ? completeJob(ticket)
                    : reassignJob(ticket))
                }
                disabled={
                  isSaving ||
                  (stage === "reassign" &&
                    (isLoadingAssignees || !selectedAssigneeId))
                }
              >
                {isSaving
                  ? "Saving…"
                  : stage === "complete"
                    ? "Confirm complete"
                    : "Confirm reassignment"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
