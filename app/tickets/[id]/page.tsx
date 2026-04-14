"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { TicketStatusWorkflowModal } from "@/components/ticket-status-workflow-modal";
import { TicketAttachmentGallery } from "@/components/ticket-attachment-gallery";
import {
  type ChatMessage,
  TicketChatPanel,
} from "@/components/ticket-chat-panel";
import { LogoutButton } from "@/components/logout-button";
import { RelayLogo } from "@/components/relay-logo";
import { RoleAwareRequestsLink } from "@/components/role-aware-requests-link";
import { StatusBadge } from "@/components/status-badge";
import { triggerActionFeedback } from "@/lib/action-feedback";
import {
  buildOnsiteLocationMapUrl,
  formatOnsiteLocationSummary,
} from "@/lib/onsite-location";
import { syncMonthlySupplierSpendSnapshotsForMonth } from "@/lib/monthly-supplier-spend";
import {
  notifyAdminsOfPartCollected,
  notifyAdminsOfPartReturned,
  notifyAdminsOfRequesterMessage,
  notifyRequesterStatusChanged,
} from "@/lib/notifications";
import { fetchCurrentProfileSettings } from "@/lib/profile-settings";
import {
  createTicketMessage,
  deleteSingleTicketAttachment,
  deleteTicketAttachmentsForTicket,
  fetchTicketAttachments,
  fetchTicketMessages,
  type TicketAttachmentRecord,
  type TicketMessageRecord,
  uploadTicketAttachments,
} from "@/lib/relay-ticketing";
import type { RelayAiContext } from "@/lib/relay-ai";
import {
  buildRequesterReturnComment,
  isRequesterReturnComment,
  REQUESTER_COLLECTED_COMMENT,
} from "@/lib/requester-ticket-actions";
import {
  buildOrderedWorkflowComment,
  buildReadyWorkflowComment,
  formatOperationalDate,
  formatOrderAmount,
  getStatusWorkflowRequirement,
  parseOrderAmountInput,
  parseDueDateToEndOfDay,
  toDateInputValue,
} from "@/lib/ticket-operational";
import { formatSupplierDisplayName, normalizeSupplierEmail } from "@/lib/suppliers";
import {
  fetchProfileDisplayNamesByUserId,
  getCurrentUserWithRole,
} from "@/lib/profile-access";
import { ticketStatuses } from "@/lib/statuses";
import { sanitizeUserFacingError } from "@/lib/security";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";

const OPERATOR_NUMBERS = [
  { label: "Call Operator 1", number: "07955273861" },
  { label: "Call Operator 2", number: "07425603839" },
] as const;

type TicketRecord = {
  id: string;
  user_id: string | null;
  requester_name: string | null;
  department: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_summary?: string | null;
  location_confirmed?: boolean | null;
  machine_reference: string | null;
  job_number: string | null;
  request_details: string | null;
  request_summary: string | null;
  status: string | null;
  assigned_to: string | null;
  notes: string | null;
  expected_delivery_date?: string | null;
  lead_time_note?: string | null;
  ordered_at?: string | null;
  ordered_by?: string | null;
  purchase_order_number?: string | null;
  supplier_name?: string | null;
  supplier_email?: string | null;
  order_amount?: number | null;
  bin_location?: string | null;
  ready_at?: string | null;
  ready_by?: string | null;
  overdue_reminder_dismissed_at?: string | null;
  overdue_reminder_dismissed_by?: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type TicketUpdate = {
  id?: string;
  status?: string | null;
  comment?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type TicketEditDraft = {
  requester_name: string;
  department: string;
  machine_reference: string;
  job_number: string;
  request_summary: string;
  request_details: string;
  status: string;
  assigned_to: string;
  notes: string;
  expected_delivery_date: string;
  lead_time_note: string;
  purchase_order_number: string;
  supplier_name: string;
  supplier_email: string;
  order_amount: string;
  bin_location: string;
};

type StatusWorkflowDialogState = {
  mode: "ordered" | "ready";
  expectedDeliveryDate: string;
  leadTimeNote: string;
  purchaseOrderNumber: string;
  supplierName: string;
  supplierEmail: string;
  orderAmount: string;
  binLocation: string;
  errorMessage: string;
};

type EditConflictDialogState = {
  assignedTo: string | null;
  status: string | null;
};

export default function TicketDetailPage() {
  const { adminBadgeCount, isAdmin, taskUnreadCount } = useNotifications();
  const params = useParams<{ id: string }>();
  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachmentRecord[]>([]);
  const [messages, setMessages] = useState<TicketMessageRecord[]>([]);
  const [messageSenderNameByUserId, setMessageSenderNameByUserId] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [requesterAvatarUrl, setRequesterAvatarUrl] = useState<string | null>(null);
  const [hasRequesterCollected, setHasRequesterCollected] = useState(false);
  const [hasRequesterReturnRequested, setHasRequesterReturnRequested] = useState(false);
  const [isMarkingCollected, setIsMarkingCollected] = useState(false);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [chatNotice, setChatNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [editDraft, setEditDraft] = useState<TicketEditDraft | null>(null);
  const [statusWorkflowDialog, setStatusWorkflowDialog] = useState<StatusWorkflowDialogState | null>(null);
  const [editConflictDialog, setEditConflictDialog] = useState<EditConflictDialogState | null>(null);

  const loadTicket = useCallback(async () => {
    setIsLoading(true);

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, profile } = await getCurrentUserWithRole(supabase, {
      forceFresh: true,
    });

    setCurrentUserId(user?.id ?? null);
    setCurrentUserDisplayName(
      profile?.display_name?.trim() ||
      user?.email?.split("@")[0]?.trim() ||
      null,
    );
    setEditConflictDialog(null);

    const { data: ticketData, error: ticketError } = await supabase
      .from("tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (ticketError) {
      setErrorMessage(
        sanitizeUserFacingError(ticketError, "Unable to load this ticket."),
      );
      setIsLoading(false);
      return;
    }

    const { data: updateData, error: updatesError } = await supabase
      .from("ticket_updates")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });

    if (updatesError) {
      setErrorMessage(
        sanitizeUserFacingError(updatesError, "Unable to load ticket history."),
      );
      setTicket(ticketData as TicketRecord);
      setUpdates([]);
      setEditDraft(buildTicketEditDraft(ticketData as TicketRecord));
      setHasRequesterCollected(false);
      setHasRequesterReturnRequested(false);
    } else {
      setErrorMessage("");
      setTicket(ticketData as TicketRecord);
      setUpdates((updateData ?? []) as TicketUpdate[]);
      setEditDraft(buildTicketEditDraft(ticketData as TicketRecord));
      setHasRequesterCollected(
        (updateData ?? []).some(
          (update) => update.comment === REQUESTER_COLLECTED_COMMENT,
        ),
      );
      setHasRequesterReturnRequested(
        (updateData ?? []).some((update) => isRequesterReturnComment(update.comment)),
      );
    }

    try {
      const [attachmentData, messageData] = await Promise.all([
        fetchTicketAttachments(supabase, ticketId),
        fetchTicketMessages(supabase, ticketId),
      ]);
      const senderNames = await fetchProfileDisplayNamesByUserId(
        supabase,
        messageData
          .map((message) => message.sender_user_id)
          .filter((userId): userId is string => Boolean(userId)),
      );

      setAttachments(attachmentData);
      setMessages(messageData);
      setMessageSenderNameByUserId(senderNames);
    } catch (loadError) {
      setErrorMessage(
        sanitizeUserFacingError(loadError, "Failed to load ticket chat."),
      );
    }

    if (ticketData?.user_id) {
      try {
        const profile = await fetchCurrentProfileSettings(supabase, ticketData.user_id);
        setRequesterAvatarUrl(profile.avatar_url ?? null);
      } catch (avatarError) {
        console.error("Failed to load ticket requester avatar", avatarError);
        setRequesterAvatarUrl(null);
      }
    } else {
      setRequesterAvatarUrl(null);
    }

    setIsLoading(false);
  }, [ticketId]);

  const openEditMode = useCallback(() => {
    if (!ticket) {
      return;
    }

    setIsEditing(true);
    setEditDraft(buildTicketEditDraft(ticket));
  }, [ticket]);

  const handleEditToggle = useCallback(() => {
    if (isEditing) {
      setIsEditing(false);
      setEditDraft(ticket ? buildTicketEditDraft(ticket) : null);
      setEditConflictDialog(null);
      return;
    }

    if (
      ticket &&
      shouldConfirmAdminEdit(ticket, currentUserDisplayName)
    ) {
      setEditConflictDialog({
        assignedTo: ticket.assigned_to,
        status: ticket.status,
      });
      return;
    }

    openEditMode();
  }, [currentUserDisplayName, isEditing, openEditMode, ticket]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTicket();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTicket]);

  async function reloadTicketConversation(supabase: NonNullable<ReturnType<typeof getSupabaseClient>>, activeTicketId: string) {
    const [attachmentData, messageData] = await Promise.all([
      fetchTicketAttachments(supabase, activeTicketId),
      fetchTicketMessages(supabase, activeTicketId),
    ]);
    const senderNames = await fetchProfileDisplayNamesByUserId(
      supabase,
      messageData
        .map((message) => message.sender_user_id)
        .filter((userId): userId is string => Boolean(userId)),
    );

    setAttachments(attachmentData);
    setMessages(messageData);
    setMessageSenderNameByUserId(senderNames);
  }

  async function handleSendMessage(payload: { messageText: string; files: File[] }) {
    if (!ticket) {
      return false;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setChatNotice({
        type: "error",
        message: "Unable to send a message right now.",
      });
      return false;
    }

    setIsSending(true);
    setErrorMessage("");
    setChatNotice(null);

    try {
      const uploadedAttachments =
        payload.files.length > 0
          ? await uploadTicketAttachments({
              supabase,
              ticketId: ticket.id,
              userId: currentUserId,
              files: payload.files,
              attachmentKind: "chat",
            })
          : [];

      const createdMessages = await createTicketMessage({
        supabase,
        ticketId: ticket.id,
        senderUserId: currentUserId,
        senderRole: "requester",
        messageText: payload.messageText,
        attachments: uploadedAttachments,
      });

      setMessages((current) => [...current, ...createdMessages]);
      setAttachments((current) => [...uploadedAttachments, ...current]);
      setChatNotice({
        type: "success",
        message: "Message sent successfully.",
      });
      triggerActionFeedback();
      void notifyAdminsOfRequesterMessage(supabase, {
        ticketId: ticket.id,
        requesterName: ticket.requester_name,
        jobNumber: ticket.job_number,
        requestSummary: ticket.request_summary ?? ticket.request_details,
      }).catch((notificationError) => {
        console.error("Failed to notify admins about requester message", notificationError);
      });
      void reloadTicketConversation(supabase, ticket.id).catch((conversationReloadError) => {
        console.error("Failed to reload ticket conversation", conversationReloadError);
      });
      return true;
    } catch (sendError) {
      console.error("Ticket chat send failed", sendError);
      const message =
        sanitizeUserFacingError(sendError, "Failed to send message.");
      setErrorMessage(
        message,
      );
      setChatNotice({
        type: "error",
        message,
      });
      return false;
    } finally {
      setIsSending(false);
    }
  }

  async function handleAskAi(question: string) {
    if (!ticket) {
      return;
    }

    setIsAiLoading(true);
    setErrorMessage("");

    try {
      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        throw new Error("Authentication is required.");
      }

      const ticketContext: RelayAiContext = {
        ticketId: ticket.id,
        status: ticket.status ?? "PENDING",
        assignedTo: ticket.assigned_to,
        latestUpdate: updates[0]?.comment ?? updates[0]?.notes ?? ticket.notes,
        requesterName: ticket.requester_name,
        department: ticket.department,
        machineReference: ticket.machine_reference,
        jobNumber: ticket.job_number,
        requestSummary: ticket.request_summary,
        requestDetails: ticket.request_details,
        history: updates.map((update) => ({
          status: update.status,
          comment: update.comment ?? update.notes,
          createdAt: update.created_at,
        })),
        recentMessages: messages.slice(-6).map((message) => ({
          senderRole: message.sender_role,
          messageText: message.message_text,
          createdAt: message.created_at,
        })),
      };

      const response = await fetch(`/api/tickets/${ticket.id}/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          question,
          ticketContext,
        }),
      });

      const payload = (await response.json()) as { message?: string; error?: string };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error || "AI request failed.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now()}`,
          ticket_id: ticket.id,
          sender_user_id: null,
          sender_role: "ai",
          message_text: payload.message ?? null,
          attachment_url: null,
          attachment_type: null,
          is_ai_message: true,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (aiError) {
      setErrorMessage(
        sanitizeUserFacingError(aiError, "Failed to get AI response."),
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleSaveTicketEdit(confirmedWorkflow?: {
    expectedDeliveryDate: string;
    leadTimeNote: string;
    purchaseOrderNumber: string;
    supplierName: string;
    supplierEmail: string;
    orderAmount: string;
    binLocation: string;
  }) {
    if (!ticket || !editDraft) {
      return;
    }

    if (!isAdmin) {
      setErrorMessage("Admin access is required for this action.");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSavingEdit(true);
    setErrorMessage("");

    const workflowRequirement = getStatusWorkflowRequirement(ticket.status, editDraft.status);
    const nextExpectedDeliveryDate =
      confirmedWorkflow?.expectedDeliveryDate ?? editDraft.expected_delivery_date;
    const nextLeadTimeNote = confirmedWorkflow?.leadTimeNote ?? editDraft.lead_time_note;
    const nextPurchaseOrderNumber =
      confirmedWorkflow?.purchaseOrderNumber ?? editDraft.purchase_order_number;
    const nextSupplierName =
      confirmedWorkflow?.supplierName ?? editDraft.supplier_name;
    const normalizedSupplierName = nextSupplierName.trim()
      ? formatSupplierDisplayName(nextSupplierName)
      : "";
    const nextSupplierEmail =
      confirmedWorkflow?.supplierEmail ?? editDraft.supplier_email;
    const normalizedSupplierEmail = nextSupplierEmail.trim()
      ? normalizeSupplierEmail(nextSupplierEmail)
      : "";
    const nextOrderAmountInput =
      confirmedWorkflow?.orderAmount ?? editDraft.order_amount;
    const parsedOrderAmount = parseOrderAmountInput(nextOrderAmountInput);
    const nextBinLocation = confirmedWorkflow?.binLocation ?? editDraft.bin_location;
    const expectedDateChanged =
      toDateInputValue(ticket.expected_delivery_date) !== nextExpectedDeliveryDate.trim();

    if (workflowRequirement && !confirmedWorkflow) {
      setStatusWorkflowDialog({
        mode: workflowRequirement,
        expectedDeliveryDate: nextExpectedDeliveryDate,
        leadTimeNote: nextLeadTimeNote,
        purchaseOrderNumber: nextPurchaseOrderNumber,
        supplierName: normalizedSupplierName,
        supplierEmail: normalizedSupplierEmail,
        orderAmount: nextOrderAmountInput,
        binLocation: nextBinLocation,
        errorMessage: "",
      });
      setIsSavingEdit(false);
      return;
    }

    if (workflowRequirement === "ordered" && !nextExpectedDeliveryDate.trim()) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "Expected delivery date is required before saving ORDERED." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    if (workflowRequirement === "ordered" && !parseDueDateToEndOfDay(nextExpectedDeliveryDate.trim())) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "Enter a valid expected delivery date before saving ORDERED." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    if (workflowRequirement === "ordered" && !nextPurchaseOrderNumber.trim()) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "PO number is required before saving ORDERED." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    if (workflowRequirement === "ordered" && !normalizedSupplierName.trim()) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "Supplier is required before saving ORDERED." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    if (workflowRequirement === "ordered" && !nextOrderAmountInput.trim()) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "Order amount is required before saving ORDERED." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    if (
      workflowRequirement === "ordered" &&
      (parsedOrderAmount == null || Number.isNaN(parsedOrderAmount))
    ) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "Enter a valid non-negative order amount before saving ORDERED." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    if (workflowRequirement === "ready" && !nextBinLocation.trim()) {
      setStatusWorkflowDialog((current) =>
        current
          ? { ...current, errorMessage: "Bin location required before marking this ticket READY." }
          : current,
      );
      setIsSavingEdit(false);
      return;
    }

    const ticketPatch = {
      requester_name: editDraft.requester_name.trim() || null,
      department: editDraft.department.trim() || null,
      machine_reference: editDraft.machine_reference.trim() || null,
      job_number: editDraft.job_number.trim() || null,
      request_summary: editDraft.request_summary.trim() || null,
      request_details: editDraft.request_details.trim() || null,
      status: editDraft.status.trim() || null,
      assigned_to: editDraft.assigned_to.trim() || null,
      notes: editDraft.notes.trim() || null,
      expected_delivery_date: nextExpectedDeliveryDate.trim() || null,
      lead_time_note: nextLeadTimeNote.trim() || null,
      purchase_order_number: nextPurchaseOrderNumber.trim() || null,
      supplier_name: normalizedSupplierName || null,
      supplier_email: normalizedSupplierEmail || null,
      order_amount:
        parsedOrderAmount != null && !Number.isNaN(parsedOrderAmount)
          ? parsedOrderAmount
          : null,
      bin_location: nextBinLocation.trim() || null,
      ordered_at:
        workflowRequirement === "ordered" ? new Date().toISOString() : ticket.ordered_at ?? null,
      ordered_by:
        workflowRequirement === "ordered"
          ? currentUserDisplayName || currentUserId || "Stores Operator"
          : ticket.ordered_by ?? null,
      ready_at:
        workflowRequirement === "ready" ? new Date().toISOString() : ticket.ready_at ?? null,
      ready_by:
        workflowRequirement === "ready"
          ? currentUserDisplayName || currentUserId || "Stores Operator"
          : ticket.ready_by ?? null,
      overdue_reminder_dismissed_at:
        editDraft.status === "ORDERED" && expectedDateChanged
          ? null
          : ticket.overdue_reminder_dismissed_at ?? null,
      overdue_reminder_dismissed_by:
        editDraft.status === "ORDERED" && expectedDateChanged
          ? null
          : ticket.overdue_reminder_dismissed_by ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("tickets")
      .update(ticketPatch)
      .eq("id", ticket.id);

    if (updateError) {
      setErrorMessage(
        sanitizeUserFacingError(updateError, "Unable to save ticket changes."),
      );
      setIsSavingEdit(false);
      return;
    }

    if (ticket.status !== ticketPatch.status) {
      const ticketUpdateRows: Array<{ ticket_id: string; status?: string | null; comment?: string }> = [
        {
          ticket_id: ticket.id,
          status: ticketPatch.status,
          comment: `Status updated to ${ticketPatch.status}.`,
        },
      ];

      if (workflowRequirement === "ordered" && ticketPatch.expected_delivery_date) {
        ticketUpdateRows.push({
          ticket_id: ticket.id,
          comment: buildOrderedWorkflowComment({
            expectedDeliveryDate: ticketPatch.expected_delivery_date,
            leadTimeNote: ticketPatch.lead_time_note,
            purchaseOrderNumber: ticketPatch.purchase_order_number,
            supplierName: ticketPatch.supplier_name,
            supplierEmail: ticketPatch.supplier_email,
            orderAmount: ticketPatch.order_amount,
            actorName: currentUserDisplayName || currentUserId || "Stores Operator",
          }),
        });
      }

      if (workflowRequirement === "ready" && ticketPatch.bin_location) {
        ticketUpdateRows.push({
          ticket_id: ticket.id,
          comment: buildReadyWorkflowComment({
            binLocation: ticketPatch.bin_location,
            actorName: currentUserDisplayName || currentUserId || "Stores Operator",
          }),
        });
      }

      const { error: statusError } = await supabase.from("ticket_updates").insert(ticketUpdateRows);

      if (statusError) {
        setErrorMessage(
          sanitizeUserFacingError(statusError, "Unable to record the status update."),
        );
        setIsSavingEdit(false);
        return;
      }
    }

    if ((ticket.notes ?? "").trim() !== (ticketPatch.notes ?? "").trim() && ticketPatch.notes) {
      const { error: noteError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticket.id,
        comment: ticketPatch.notes,
      });

      if (noteError) {
        setErrorMessage(
          sanitizeUserFacingError(noteError, "Unable to save the ticket note."),
        );
        setIsSavingEdit(false);
        return;
      }
    }

    setTicket((current) =>
      current
        ? {
            ...current,
            ...ticketPatch,
          }
        : current,
    );
    setEditDraft((current) =>
      current
        ? {
            ...current,
            expected_delivery_date: nextExpectedDeliveryDate,
            lead_time_note: nextLeadTimeNote,
            purchase_order_number: nextPurchaseOrderNumber,
            supplier_name: normalizedSupplierName,
            supplier_email: normalizedSupplierEmail,
            order_amount: nextOrderAmountInput,
            bin_location: nextBinLocation,
          }
        : current,
    );
    const updatedOrderMonth = ticketPatch.ordered_at?.slice(0, 7);
    if (updatedOrderMonth) {
      void syncMonthlySupplierSpendSnapshotsForMonth(supabase, `${updatedOrderMonth}-01`).catch((snapshotError) => {
        console.error("Failed to refresh monthly supplier spend snapshots", snapshotError);
      });
    }
    setIsEditing(false);
    setIsSavingEdit(false);
    setStatusWorkflowDialog(null);
    if (ticketPatch.status === "COMPLETED") {
      void deleteTicketAttachmentsForTicket(supabase, ticket.id).catch((attachmentError) => {
        console.error("Failed to delete completed ticket attachments", attachmentError);
      });
    }
    if (ticket.status !== ticketPatch.status) {
      void notifyRequesterStatusChanged(supabase, {
        userId: ticket.user_id,
        ticketId: ticket.id,
        jobNumber: ticket.job_number,
        nextStatus: ticketPatch.status ?? "PENDING",
        requestSummary: ticket.request_summary ?? ticket.request_details,
        assignedTo: ticketPatch.assigned_to,
        binLocation: ticketPatch.bin_location,
      }).catch((notificationError) => {
        console.error("Failed to notify requester about status change", notificationError);
      });
    }
    void loadTicket();
  }

  async function handleDeleteAttachment(attachmentId: string) {
    const attachment = attachments.find((candidate) => candidate.id === attachmentId);

    if (!attachment || attachment.uploaded_by !== currentUserId || attachment.attachment_context !== "ticket") {
      setErrorMessage("You can only delete your own uploaded ticket photos.");
      return;
    }

    const confirmed = window.confirm(
      "Delete this photo permanently from the ticket? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setDeletingAttachmentId(attachmentId);
    setErrorMessage("");

    try {
      await deleteSingleTicketAttachment(supabase, attachmentId);
      setAttachments((current) => current.filter((candidate) => candidate.id !== attachmentId));
    } catch (deleteError) {
      setErrorMessage(
        sanitizeUserFacingError(deleteError, "Failed to delete the photo."),
      );
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  async function handleMarkCollected() {
    if (!ticket) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsMarkingCollected(true);
    setErrorMessage("");

    try {
      const { data: existingCollectedUpdate, error: existingCollectedError } = await supabase
        .from("ticket_updates")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("comment", REQUESTER_COLLECTED_COMMENT)
        .limit(1);

      if (existingCollectedError) {
        throw new Error(existingCollectedError.message);
      }

      if ((existingCollectedUpdate ?? []).length === 0) {
        const { error: insertError } = await supabase.from("ticket_updates").insert({
          ticket_id: ticket.id,
          comment: REQUESTER_COLLECTED_COMMENT,
        });

        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      setHasRequesterCollected(true);

      try {
        await notifyAdminsOfPartCollected(supabase, {
          ticketId: ticket.id,
          requesterName: ticket.requester_name,
          jobNumber: ticket.job_number,
          requestSummary: ticket.request_summary ?? ticket.request_details,
        });
      } catch (notificationError) {
        console.error("Failed to notify admins that a part was collected", notificationError);
      }

      await loadTicket();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(
          error,
          "Unable to mark the request as collected.",
        ),
      );
    } finally {
      setIsMarkingCollected(false);
    }
  }

  async function handleRequestReturn() {
    if (!ticket) {
      return;
    }

    const trimmedReason = returnReason.trim();

    if (!trimmedReason) {
      setErrorMessage("Please give a reason for the return request.");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setIsSubmittingReturn(true);
    setErrorMessage("");

    try {
      const returnComment = buildRequesterReturnComment(trimmedReason);
      const nextUpdatedAt = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          status: "QUERY",
          updated_at: nextUpdatedAt,
        })
        .eq("id", ticket.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      const { error: insertError } = await supabase.from("ticket_updates").insert([
        {
          ticket_id: ticket.id,
          status: "QUERY",
        },
        {
          ticket_id: ticket.id,
          comment: returnComment,
        },
      ]);

      if (insertError) {
        throw new Error(insertError.message);
      }

      setHasRequesterReturnRequested(true);
      setReturnReason("");

      try {
        await notifyAdminsOfPartReturned(supabase, {
          ticketId: ticket.id,
          requesterName: ticket.requester_name,
          jobNumber: ticket.job_number,
          requestSummary: ticket.request_summary ?? ticket.request_details,
          reason: trimmedReason,
        });
      } catch (notificationError) {
        console.error("Failed to notify admins that a part was returned", notificationError);
      }

      await loadTicket();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to request a part return."),
      );
    } finally {
      setIsSubmittingReturn(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link href="/settings" className="rounded-full px-4 py-2 hover:bg-white">
              Settings
            </Link>
            <RoleAwareRequestsLink className="rounded-full px-4 py-2 hover:bg-white" />
            <Link href="/tasks" className="rounded-full px-4 py-2 hover:bg-white">
              Tasks
              <NotificationBadge count={taskUnreadCount} />
            </Link>
            {isAdmin ? (
              <>
                <Link
                  href="/incidents"
                  className="rounded-full px-4 py-2 hover:bg-white"
                >
                  Workshop Control
                </Link>
                <Link
                  href="/control"
                  className="rounded-full px-4 py-2 hover:bg-white"
                >
                  Admin Control
                </Link>
                <Link href="/admin" className="rounded-full px-4 py-2 hover:bg-white">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </Link>
              </>
            ) : null}
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard>
          {statusWorkflowDialog ? (
            <TicketStatusWorkflowModal
              mode={statusWorkflowDialog.mode}
              isSubmitting={isSavingEdit}
              expectedDeliveryDate={statusWorkflowDialog.expectedDeliveryDate}
              leadTimeNote={statusWorkflowDialog.leadTimeNote}
              purchaseOrderNumber={statusWorkflowDialog.purchaseOrderNumber}
              supplierName={statusWorkflowDialog.supplierName}
              supplierEmail={statusWorkflowDialog.supplierEmail}
              orderAmount={statusWorkflowDialog.orderAmount}
              binLocation={statusWorkflowDialog.binLocation}
              errorMessage={statusWorkflowDialog.errorMessage}
              onExpectedDeliveryDateChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, expectedDeliveryDate: value, errorMessage: "" } : current,
                )
              }
              onLeadTimeNoteChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, leadTimeNote: value, errorMessage: "" } : current,
                )
              }
              onPurchaseOrderNumberChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, purchaseOrderNumber: value, errorMessage: "" } : current,
                )
              }
              onSupplierNameChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, supplierName: value, errorMessage: "" } : current,
                )
              }
              onSupplierEmailChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, supplierEmail: value, errorMessage: "" } : current,
                )
              }
              onOrderAmountChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, orderAmount: value, errorMessage: "" } : current,
                )
              }
              onBinLocationChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, binLocation: value, errorMessage: "" } : current,
                )
              }
              onCancel={() => setStatusWorkflowDialog(null)}
              onConfirm={() => {
                const dialog = statusWorkflowDialog;

                if (!dialog) {
                  return;
                }

                void handleSaveTicketEdit({
                  expectedDeliveryDate: dialog.expectedDeliveryDate,
                  leadTimeNote: dialog.leadTimeNote,
                  purchaseOrderNumber: dialog.purchaseOrderNumber,
                  supplierName: dialog.supplierName,
                  supplierEmail: dialog.supplierEmail,
                  orderAmount: dialog.orderAmount,
                  binLocation: dialog.binLocation,
                });
              }}
            />
          ) : null}
          {editConflictDialog ? (
            <AdminEditConflictModal
              assignedTo={editConflictDialog.assignedTo}
              status={editConflictDialog.status}
              onCancel={() => setEditConflictDialog(null)}
              onConfirm={() => {
                setEditConflictDialog(null);
                openEditMode();
              }}
            />
          ) : null}
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
              <div className="space-y-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                  Request Record
                </div>
                <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Ticket Detail
                </h1>
                <p className="text-base leading-8 text-slate-600">
                  Review request information, workflow history, and ticket
                  commentary in one place.
                </p>
              </div>
              <div className="self-start">
                <div className="flex flex-wrap gap-3">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={handleEditToggle}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      {isEditing ? "Cancel Edit" : "Edit Ticket"}
                    </button>
                  ) : null}
                  {isAdmin && isEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setEditDraft(ticket ? buildTicketEditDraft(ticket) : null);
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      Back to Ticket
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void loadTicket()}
                    disabled={isLoading}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoading ? "Refreshing..." : "Refresh"}
                  </button>
                  <RoleAwareRequestsLink
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                    userLabel="Back to Requests"
                    adminLabel="Back to Smart Search"
                    showBadge={false}
                  />
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Loading ticket...
              </div>
            ) : ticket ? (
              <div className="mt-8 space-y-6">
                <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
                  <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Ticket ID
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {ticket.id}
                        </p>
                      </div>
                      <StatusBadge status={ticket.status ?? "PENDING"} />
                    </div>

                    {isAdmin && isEditing && editDraft ? (
                      <div className="mt-6 space-y-5">
                        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          {requesterAvatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={requesterAvatarUrl}
                              alt={ticket.requester_name ?? "Requester"}
                              className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                            />
                          ) : null}
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {ticket.requester_name ?? "Requester"}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                              Profile photo shown on admin edit view
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-5 sm:grid-cols-2">
                          <EditField
                            label="Requester"
                            value={editDraft.requester_name}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, requester_name: value } : current,
                              )
                            }
                          />
                          <EditSelect
                            label="Department"
                            value={editDraft.department}
                            options={["Onsite", "Yard"]}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, department: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Machine"
                            value={editDraft.machine_reference}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, machine_reference: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Job Number"
                            value={editDraft.job_number}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, job_number: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Assigned User"
                            value={editDraft.assigned_to}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, assigned_to: value } : current,
                              )
                            }
                          />
                          <EditSelect
                            label="Status"
                            value={editDraft.status}
                            options={[...ticketStatuses]}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, status: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Expected Delivery"
                            type="date"
                            value={editDraft.expected_delivery_date}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, expected_delivery_date: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="PO Number"
                            value={editDraft.purchase_order_number}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, purchase_order_number: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Supplier"
                            value={editDraft.supplier_name}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, supplier_name: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Supplier Email"
                            value={editDraft.supplier_email}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, supplier_email: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Order Amount"
                            type="number"
                            value={editDraft.order_amount}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, order_amount: value } : current,
                              )
                            }
                          />
                          <EditField
                            label="Bin Location"
                            value={editDraft.bin_location}
                            onChange={(value) =>
                              setEditDraft((current) =>
                                current ? { ...current, bin_location: value } : current,
                              )
                            }
                          />
                        </div>

                        <EditArea
                          label="Request Summary"
                          value={editDraft.request_summary}
                          onChange={(value) =>
                            setEditDraft((current) =>
                              current ? { ...current, request_summary: value } : current,
                            )
                          }
                        />
                        <EditArea
                          label="Request Details"
                          value={editDraft.request_details}
                          onChange={(value) =>
                            setEditDraft((current) =>
                              current ? { ...current, request_details: value } : current,
                            )
                          }
                        />
                        <EditArea
                          label="Admin Notes"
                          value={editDraft.notes}
                          onChange={(value) =>
                            setEditDraft((current) =>
                              current ? { ...current, notes: value } : current,
                            )
                          }
                        />
                        <EditArea
                          label="Lead Time Note"
                          value={editDraft.lead_time_note}
                          onChange={(value) =>
                            setEditDraft((current) =>
                              current ? { ...current, lead_time_note: value } : current,
                            )
                          }
                        />

                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(false);
                              setEditDraft(buildTicketEditDraft(ticket));
                            }}
                            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                          >
                            Back to Ticket
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveTicketEdit()}
                            disabled={isSavingEdit}
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSavingEdit ? "Saving..." : "Save Ticket"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                          <DetailItem label="Requester" value={ticket.requester_name} />
                          <DetailItem label="Department" value={ticket.department} />
                          <DetailItem label="Machine" value={ticket.machine_reference} />
                          <DetailItem label="Job Number" value={ticket.job_number} />
                          <DetailItem label="Assigned User" value={ticket.assigned_to} />
                          <DetailItem label="Expected Delivery" value={formatOperationalDate(ticket.expected_delivery_date)} />
                          <DetailItem label="PO Number" value={ticket.purchase_order_number} />
                          <DetailItem label="Supplier" value={ticket.supplier_name} />
                          <DetailItem label="Supplier Email" value={ticket.supplier_email} />
                          <DetailItem label="Order Amount" value={formatOrderAmount(ticket.order_amount)} />
                          <DetailItem label="Bin Location" value={ticket.bin_location} />
                          <DetailItem label="Lead Time Note" value={ticket.lead_time_note} />
                          <DetailItem
                            label="Updated"
                            value={formatDate(ticket.updated_at)}
                          />
                        </dl>

                        {isOnsiteTicket(ticket) ? (
                          <div className="mt-6">
                            <OnsiteLocationCard ticket={ticket} />
                          </div>
                        ) : null}

                        <div className="mt-6 space-y-4">
                          <DetailBlock
                            label="Request Details"
                            value={ticket.request_details ?? ticket.request_summary}
                          />
                          <DetailBlock label="Admin Notes" value={ticket.notes} />
                        </div>
                        {!isAdmin && ticket.status === "READY" && ticket.bin_location?.trim() ? (
                          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                              Collection Bin
                            </p>
                            <p className="mt-2 text-lg font-semibold text-emerald-900">
                              {ticket.bin_location}
                            </p>
                          </div>
                        ) : null}
                        {!isAdmin && ticket.status === "READY" ? (
                          <div className="mt-6">
                            {hasRequesterCollected ? (
                              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                                Collection confirmed. Admin has been notified.
                              </div>
                            ) : hasRequesterReturnRequested ? (
                              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                                Return requested. Stores has been notified.
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={() => void handleMarkCollected()}
                                    disabled={isMarkingCollected || isSubmittingReturn}
                                    className="inline-flex h-11 items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isMarkingCollected ? "Saving..." : "Confirm Collection"}
                                  </button>
                                </div>
                                <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                                  <label className="block text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                                    Request a return
                                  </label>
                                  <p className="mt-1 text-sm text-amber-800/80">
                                    If the supplied part is wrong or unsuitable, tell Stores why it needs to be returned.
                                  </p>
                                  <textarea
                                    value={returnReason}
                                    onChange={(event) => setReturnReason(event.target.value)}
                                    rows={3}
                                    placeholder="Explain why this part needs to be returned."
                                    className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300"
                                  />
                                  <div className="mt-3 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => void handleRequestReturn()}
                                      disabled={isMarkingCollected || isSubmittingReturn}
                                      className="inline-flex h-11 items-center justify-center rounded-xl border border-amber-300 bg-amber-100 px-4 text-sm font-semibold text-amber-800 transition hover:border-amber-400 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {isSubmittingReturn ? "Saving..." : "Submit Return Request"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </>
                    )}
                  </section>

                  <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Status History & Comments
                      </p>
                      <p className="text-sm leading-6 text-slate-500">
                        Activity from status changes and comment updates.
                      </p>
                    </div>

                    <div className="mt-6 space-y-4">
                      {updates.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                          No history entries found for this ticket yet.
                        </div>
                      ) : (
                        updates.map((update, index) => (
                          <article
                            key={update.id ?? `${update.created_at}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-white p-5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <StatusBadge
                                status={update.status ?? ticket.status ?? "PENDING"}
                              />
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                {formatDateTime(update.created_at)}
                              </p>
                            </div>
                            <p className="mt-4 text-sm leading-7 text-slate-600">
                              {update.comment ?? update.notes ?? "Status updated."}
                            </p>
                          </article>
                        ))
                      )}
                    </div>
                  </section>
                </div>

                <TicketAttachmentGallery
                  attachments={attachments.map((attachment) => ({
                    id: attachment.id,
                    name: attachment.file_name ?? "Attachment",
                    url: attachment.signed_url ?? null,
                    returnHref: `/tickets/${ticket.id}`,
                    caption:
                      attachment.attachment_context === "chat"
                        ? "Image shared in the ticket conversation"
                        : "Image uploaded with the parts request",
                  }))}
                  allowDownload={isAdmin}
                  canDeleteAttachmentIds={attachments
                    .filter(
                      (attachment) =>
                        attachment.uploaded_by === currentUserId &&
                        attachment.attachment_context === "ticket",
                    )
                    .map((attachment) => attachment.id)}
                  deletingAttachmentId={deletingAttachmentId}
                  onDeleteAttachment={(attachmentId) => void handleDeleteAttachment(attachmentId)}
                />

                <TicketChatPanel
                  ticketId={ticket.id}
                  ticketLabel={ticket.job_number}
                  ticketStatus={ticket.status ?? "PENDING"}
                  latestUpdate={
                    updates[0]?.comment ??
                    updates[0]?.notes ??
                    "No recent chat summary available."
                  }
                  assignedTo={ticket.assigned_to}
                  messages={mapMessagesToChat(
                    messages,
                    ticket,
                    attachments,
                    currentUserId,
                    currentUserDisplayName,
                    messageSenderNameByUserId,
                  )}
                  isSending={isSending}
                  isAiLoading={isAiLoading}
                  notice={chatNotice}
                  onSendMessage={handleSendMessage}
                  onAskAi={handleAskAi}
                  operatorChatHref={buildOperatorChatHref(ticket)}
                  operatorSmsHref={buildOperatorSmsHref(ticket)}
                  operatorCallHrefs={buildOperatorCallHrefs()}
                />
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Ticket not found.
              </div>
            )}
          </section>
        </AuthGuard>
      </div>
    </main>
  );
}

function mapMessagesToChat(
  messages: TicketMessageRecord[],
  ticket: TicketRecord,
  attachments: TicketAttachmentRecord[],
  currentUserId: string | null,
  currentUserDisplayName: string | null,
  senderNameByUserId: Record<string, string>,
): ChatMessage[] {
  return messages.map((message) => {
    const attachment = attachments.find(
      (candidate) => candidate.message_id === message.id,
    );

    return {
      id: message.id,
      senderName: resolveSenderName(
        message,
        ticket,
        currentUserId,
        currentUserDisplayName,
        senderNameByUserId,
      ),
      senderRole:
        message.sender_role === "parts" ? "operator" : message.sender_role,
      messageText: message.message_text ?? undefined,
      attachmentUrl: attachment?.signed_url ?? undefined,
      attachmentName: attachment?.file_name ?? undefined,
      createdAt: message.created_at ?? new Date().toISOString(),
      isAiMessage: message.is_ai_message ?? false,
    };
  });
}

function resolveSenderName(
  message: TicketMessageRecord,
  ticket: TicketRecord,
  currentUserId: string | null,
  currentUserDisplayName: string | null,
  senderNameByUserId: Record<string, string>,
) {
  if (message.is_ai_message || message.sender_role === "ai") {
    return "RELAY Assistant";
  }

  if (message.sender_role === "requester") {
    return ticket.requester_name ?? "Requester";
  }

  if (message.sender_role === "admin") {
    if (message.sender_user_id && senderNameByUserId[message.sender_user_id]) {
      return senderNameByUserId[message.sender_user_id];
    }

    if (message.sender_user_id && message.sender_user_id === currentUserId) {
      return currentUserDisplayName || "Administrator";
    }

    return "Administrator";
  }

  if (message.sender_role === "operator") {
    if (message.sender_user_id && senderNameByUserId[message.sender_user_id]) {
      return senderNameByUserId[message.sender_user_id];
    }

    if (message.sender_user_id && message.sender_user_id === currentUserId) {
      return currentUserDisplayName || ticket.assigned_to || "Stores Operator";
    }

    return ticket.assigned_to || "Stores Operator";
  }

  return ticket.assigned_to || "Stores Operator";
}

function buildOperatorMessage(ticket: TicketRecord) {
  const partsRequested =
    ticket.request_summary?.trim() ||
    ticket.request_details?.trim() ||
    "No parts summary provided";
  const jobReference = ticket.job_number?.trim() || ticket.id;

  return [
    "Hello, I am following up on:",
    `Job Number: ${jobReference}`,
    `Requester: ${ticket.requester_name?.trim() || "Unknown requester"}`,
    `Parts Requested: ${partsRequested}`,
  ].join("\n");
}

function buildOperatorChatHref(ticket: TicketRecord) {
  const message = encodeURIComponent(buildOperatorMessage(ticket));
  return `https://wa.me/447955273861?text=${message}`;
}

function buildOperatorCallHrefs() {
  return OPERATOR_NUMBERS.map((option) => ({
    label: option.label,
    href: `tel:${option.number}`,
  }));
}

function buildOperatorSmsHref(ticket: TicketRecord) {
  return `sms:${OPERATOR_NUMBERS[0].number}?&body=${encodeURIComponent(buildOperatorMessage(ticket))}`;
}

function buildTicketEditDraft(ticket: TicketRecord): TicketEditDraft {
  return {
    requester_name: ticket.requester_name ?? "",
    department: ticket.department ?? "",
    machine_reference: ticket.machine_reference ?? "",
    job_number: ticket.job_number ?? "",
    request_summary: ticket.request_summary ?? "",
    request_details: ticket.request_details ?? "",
    status: ticket.status ?? "PENDING",
    assigned_to: ticket.assigned_to ?? "",
    notes: ticket.notes ?? "",
    expected_delivery_date: toDateInputValue(ticket.expected_delivery_date),
    lead_time_note: ticket.lead_time_note ?? "",
    purchase_order_number: ticket.purchase_order_number ?? "",
    supplier_name: ticket.supplier_name ?? "",
    supplier_email: ticket.supplier_email ?? "",
    order_amount:
      typeof ticket.order_amount === "number" && !Number.isNaN(ticket.order_amount)
        ? String(ticket.order_amount)
        : "",
    bin_location: ticket.bin_location ?? "",
  };
}

function shouldConfirmAdminEdit(
  ticket: TicketRecord,
  currentUserDisplayName: string | null,
) {
  const assignedTo = ticket.assigned_to?.trim() ?? "";
  const normalizedAssignedTo = assignedTo.toLowerCase();
  const normalizedCurrentUser = currentUserDisplayName?.trim().toLowerCase() ?? "";

  if (assignedTo && normalizedAssignedTo && normalizedAssignedTo !== normalizedCurrentUser) {
    return true;
  }

  return ticket.status === "IN_PROGRESS" && Boolean(assignedTo);
}

function AdminEditConflictModal({
  assignedTo,
  status,
  onCancel,
  onConfirm,
}: {
  assignedTo: string | null;
  status: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const assignedUserLabel = assignedTo?.trim() || "another operator";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_36px_100px_-42px_rgba(0,0,0,0.76)]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Edit Confirmation
          </p>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
            This ticket is already being handled
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            This ticket is assigned to <span className="font-semibold text-slate-900">{assignedUserLabel}</span>
            {status === "IN_PROGRESS" ? " and is currently marked IN_PROGRESS." : "."} Do you want to continue editing?
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Continue Editing
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-2 text-sm leading-7 text-slate-700">{value || "-"}</dd>
    </div>
  );
}

function EditField({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "date" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      />
    </label>
  );
}

function EditSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function EditArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition focus:border-slate-400"
      />
    </label>
  );
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">
        {value || "-"}
      </p>
    </div>
  );
}

function OnsiteLocationCard({ ticket }: { ticket: TicketRecord }) {
  const mapUrl = buildMapUrl(ticket);
  const locationSummary = formatLocationSummary(ticket);

  if (!locationSummary && !mapUrl) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Onsite Location
          </p>
          <p className="text-sm leading-7 text-slate-700">
            {locationSummary || "Onsite request"}
          </p>
          {ticket.location_confirmed ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Location confirmed
            </p>
          ) : null}
        </div>
        {mapUrl ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white"
          >
            {ticket.location_lat != null && ticket.location_lng != null
              ? "Open in Maps"
              : "View Onsite Location"}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOnsiteTicket(ticket: TicketRecord) {
  return ticket.department?.trim().toLowerCase() === "onsite";
}

function formatLocationSummary(ticket: TicketRecord) {
  return formatOnsiteLocationSummary(ticket);
}

function buildMapUrl(ticket: TicketRecord) {
  return buildOnsiteLocationMapUrl(ticket);
}
