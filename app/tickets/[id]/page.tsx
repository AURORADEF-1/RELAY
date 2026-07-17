"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { useNotifications } from "@/components/notification-provider";
import { ConsoleIcon, type ConsoleIconName } from "@/components/console/console-icon";
import { ConsoleShell } from "@/components/console/console-shell";
import { TicketStatusWorkflowModal } from "@/components/ticket-status-workflow-modal";
import { TicketAttachmentGallery } from "@/components/ticket-attachment-gallery";
import {
  type ChatMessage,
  TicketChatPanel,
} from "@/components/ticket-chat-panel";
import { StatusBadge } from "@/components/status-badge";
import { triggerActionFeedback } from "@/lib/action-feedback";
import {
  buildOnsiteLocationMapUrl,
  formatOnsiteLocationSummary,
} from "@/lib/onsite-location";
import { syncMonthlySupplierSpendSnapshotsForMonth } from "@/lib/monthly-supplier-spend";
import {
  buildSupplierOrderDispatchPlan,
  loadSupplierDispatchContact,
} from "@/lib/order-communications";
import {
  buildRetailCustomerComment,
  buildRetailCustomerDispatchPlan,
  type RetailDeliveryMethod,
} from "@/lib/retail-sales";
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
import { TakeuchiPartSuggestions } from "@/components/takeuchi-part-suggestions";
import {
  buildEmptyTicketPartDraft,
  createTicketPart,
  fetchTicketParts,
  formatTicketPartStatus,
  ticketPartStatuses,
  type TicketPartDraft,
  type TicketPartRecord,
  type TicketPartStatus,
} from "@/lib/ticket-parts";
import {
  buildEmptyTicketPurchaseOrderDraft,
  createTicketPurchaseOrder,
  fetchTicketPurchaseOrders,
  formatTicketPurchaseOrderStatus,
  ticketPurchaseOrderStatuses,
  type TicketPurchaseOrderDraft,
  type TicketPurchaseOrderRecord,
  type TicketPurchaseOrderStatus,
} from "@/lib/ticket-purchase-orders";
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
import {
  isLikelySameOperatorName,
  shouldRetryWithoutUrgentFields,
  shouldShowUrgentReminder,
} from "@/lib/ticket-urgency";
import { formatSupplierDisplayName, normalizeSupplierEmail } from "@/lib/suppliers";
import {
  fetchProfileDisplayNamesByUserId,
  getCurrentUserWithRole,
} from "@/lib/profile-access";
import { fetchRequesterAccounts } from "@/lib/requester-accounts";
import type { SupplierOrderDispatchPreference } from "@/lib/order-communications";
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
  visible_to_user_id?: string | null;
  requester_name: string | null;
  department: string | null;
  is_retail_sale?: boolean | null;
  retail_sales_reference?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  retail_delivery_method?: RetailDeliveryMethod | null;
  retail_delivery_address?: string | null;
  retail_apc_tracking_number?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_summary?: string | null;
  location_confirmed?: boolean | null;
  machine_reference: string | null;
  machine_number?: string | null;
  machine_number_normalized?: string | null;
  machine_fleet_type?: string | null;
  machine_item_description?: string | null;
  machine_make?: string | null;
  machine_model?: string | null;
  machine_serial_number?: string | null;
  machine_status?: string | null;
  machine_quantity?: number | null;
  machine_buying_price?: number | null;
  machine_selling_price?: number | null;
  machine_source_sheet?: string | null;
  machine_source_row?: number | null;
  machine_verified?: boolean | null;
  machine_verified_at?: string | null;
  machine_verified_by?: string | null;
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
  is_urgent?: boolean | null;
  urgent_flagged_at?: string | null;
  urgent_flagged_by?: string | null;
  urgent_reminder_dismissed_at?: string | null;
  urgent_reminder_dismissed_by?: string | null;
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
  visible_to_user_id: string;
  notes: string;
  expected_delivery_date: string;
  lead_time_note: string;
  purchase_order_number: string;
  supplier_name: string;
  supplier_email: string;
  order_amount: string;
  bin_location: string;
  retail_sales_reference: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  retail_delivery_method: "" | RetailDeliveryMethod;
  retail_delivery_address: string;
  retail_apc_tracking_number: string;
  is_urgent: boolean;
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
  retailSalesReference: string;
  dispatchPreference: SupplierOrderDispatchPreference;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  retailDeliveryMethod: "" | RetailDeliveryMethod;
  retailDeliveryAddress: string;
  retailApcTrackingNumber: string;
  errorMessage: string;
};

type EditConflictDialogState = {
  assignedTo: string | null;
  status: string | null;
};

type RequesterAccountOption = {
  user_id: string;
  full_name: string | null;
};

type WorkspaceTab = "overview" | "parts" | "activity" | "conversation" | "files";

const workspaceTabs: Array<{
  id: WorkspaceTab;
  label: string;
  icon: ConsoleIconName;
}> = [
  { id: "overview", label: "Overview", icon: "clipboard" },
  { id: "parts", label: "Parts & Purchase Orders", icon: "parts" },
  { id: "activity", label: "Activity", icon: "activity" },
  { id: "conversation", label: "Conversation", icon: "message" },
  { id: "files", label: "Files", icon: "file" },
];

export default function TicketDetailPage() {
  const { isAdmin } = useNotifications();
  const params = useParams<{ id: string }>();
  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [ticket, setTicket] = useState<TicketRecord | null>(null);
  const [updates, setUpdates] = useState<TicketUpdate[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachmentRecord[]>([]);
  const [messages, setMessages] = useState<TicketMessageRecord[]>([]);
  const [ticketParts, setTicketParts] = useState<TicketPartRecord[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<TicketPurchaseOrderRecord[]>([]);
  const [messageSenderNameByUserId, setMessageSenderNameByUserId] = useState<Record<string, string>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);
  const [requesterAccounts, setRequesterAccounts] = useState<RequesterAccountOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingPart, setIsSavingPart] = useState(false);
  const [isSavingPurchaseOrder, setIsSavingPurchaseOrder] = useState(false);
  const partFormRef = useRef<HTMLDivElement | null>(null);
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
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [editDraft, setEditDraft] = useState<TicketEditDraft | null>(null);
  const [partDraft, setPartDraft] = useState<TicketPartDraft>(buildEmptyTicketPartDraft());
  const [purchaseOrderDraft, setPurchaseOrderDraft] = useState<TicketPurchaseOrderDraft>(
    buildEmptyTicketPurchaseOrderDraft(),
  );
  const [partNotice, setPartNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
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

    if (isAdmin) {
      try {
        const requesterRecords = await fetchRequesterAccounts(supabase);
        setRequesterAccounts(requesterRecords);
      } catch (requesterError) {
        console.error("Failed to load requester accounts", requesterError);
        setRequesterAccounts([]);
      }
    } else {
      setRequesterAccounts([]);
    }

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
      setPartDraft(buildEmptyTicketPartDraft());
      setPurchaseOrderDraft(buildEmptyTicketPurchaseOrderDraft());
      setHasRequesterCollected(false);
      setHasRequesterReturnRequested(false);
    } else {
      setErrorMessage("");
      setTicket(ticketData as TicketRecord);
      setUpdates((updateData ?? []) as TicketUpdate[]);
      setEditDraft(buildTicketEditDraft(ticketData as TicketRecord));
      setPartDraft(buildEmptyTicketPartDraft());
      setPurchaseOrderDraft(buildEmptyTicketPurchaseOrderDraft());
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
      const [attachmentData, messageData, partData, purchaseOrderData] = await Promise.all([
        fetchTicketAttachments(supabase, ticketId),
        fetchTicketMessages(supabase, ticketId),
        fetchTicketParts(supabase, ticketId),
        fetchTicketPurchaseOrders(supabase, ticketId),
      ]);
      const senderNames = await fetchProfileDisplayNamesByUserId(
        supabase,
        messageData
          .map((message) => message.sender_user_id)
          .filter((userId): userId is string => Boolean(userId)),
      );

      setAttachments(attachmentData);
      setMessages(messageData);
      setTicketParts(partData);
      setPurchaseOrders(purchaseOrderData);
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
  }, [isAdmin, ticketId]);

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
    if (!isEditing) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !statusWorkflowDialog) {
        handleEditToggle();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [handleEditToggle, isEditing, statusWorkflowDialog]);

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

      const aiSenderUserId = currentUserId ?? ticket.user_id;

      if (!aiSenderUserId) {
        throw new Error("Unable to resolve a sender for the AI message.");
      }

      setMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now()}`,
          ticket_id: ticket.id,
          sender_user_id: aiSenderUserId,
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
    retailSalesReference?: string;
    dispatchPreference: SupplierOrderDispatchPreference;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    retailDeliveryMethod?: "" | RetailDeliveryMethod;
    retailDeliveryAddress?: string;
    retailApcTrackingNumber?: string;
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
    const nextRetailSalesReference =
      confirmedWorkflow?.retailSalesReference ?? editDraft.retail_sales_reference;
    const nextCustomerName = confirmedWorkflow?.customerName ?? editDraft.customer_name;
    const nextCustomerEmail = confirmedWorkflow?.customerEmail ?? editDraft.customer_email;
    const nextCustomerPhone = confirmedWorkflow?.customerPhone ?? editDraft.customer_phone;
    const nextRetailDeliveryMethod =
      confirmedWorkflow?.retailDeliveryMethod ?? editDraft.retail_delivery_method;
    const nextRetailDeliveryAddress =
      confirmedWorkflow?.retailDeliveryAddress ?? editDraft.retail_delivery_address;
    const nextRetailApcTrackingNumber =
      confirmedWorkflow?.retailApcTrackingNumber ?? editDraft.retail_apc_tracking_number;
    const expectedDateChanged =
      toDateInputValue(ticket.expected_delivery_date) !== nextExpectedDeliveryDate.trim();
    const nextIsUrgent = editDraft.is_urgent;
    const currentIsUrgent = Boolean(ticket.is_urgent);
    const assignmentChanged = editDraft.assigned_to.trim() !== (ticket.assigned_to?.trim() ?? "");
    const urgentFlagChanged = nextIsUrgent !== currentIsUrgent;

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
        retailSalesReference: nextRetailSalesReference,
        customerName: nextCustomerName,
        customerEmail: nextCustomerEmail,
        customerPhone: nextCustomerPhone,
        retailDeliveryMethod: nextRetailDeliveryMethod as "" | RetailDeliveryMethod,
        retailDeliveryAddress: nextRetailDeliveryAddress,
        retailApcTrackingNumber: nextRetailApcTrackingNumber,
        dispatchPreference: "none",
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
      if (!ticket.is_retail_sale) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Supplier is required before saving ORDERED." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }
    }

    if (workflowRequirement === "ordered" && !ticket.is_retail_sale && !nextOrderAmountInput.trim()) {
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
      !ticket.is_retail_sale &&
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

    if (workflowRequirement === "ordered" && ticket.is_retail_sale) {
      if (!nextRetailSalesReference.trim()) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Sales reference is required before saving ORDERED." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (!nextPurchaseOrderNumber.trim()) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "PO number is required before saving ORDERED." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (!normalizedSupplierName.trim()) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Supplier is required before saving ORDERED." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (!nextCustomerName.trim()) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Customer name is required for retail sales." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (!nextCustomerEmail.trim() && !nextCustomerPhone.trim()) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Customer email or phone is required for retail sales." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (!nextRetailDeliveryMethod) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Select collection or delivery for this retail sale." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (nextRetailDeliveryMethod === "delivery" && !nextRetailDeliveryAddress.trim()) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "Delivery address is required when delivery is selected." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }

      if (
        nextRetailDeliveryMethod === "delivery" &&
        !nextRetailApcTrackingNumber.trim()
      ) {
        setStatusWorkflowDialog((current) =>
          current
            ? { ...current, errorMessage: "APC tracking number is required for delivery orders." }
            : current,
        );
        setIsSavingEdit(false);
        return;
      }
    }

    if (
      workflowRequirement === "ready" &&
      !nextBinLocation.trim() &&
      !(ticket.is_retail_sale && nextRetailDeliveryMethod === "delivery")
    ) {
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
      visible_to_user_id: editDraft.visible_to_user_id.trim() || null,
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
      is_urgent: nextIsUrgent,
      urgent_flagged_at:
        nextIsUrgent
          ? currentIsUrgent && ticket.urgent_flagged_at
            ? ticket.urgent_flagged_at
            : new Date().toISOString()
          : null,
      urgent_flagged_by:
        nextIsUrgent
          ? currentIsUrgent && ticket.urgent_flagged_by
            ? ticket.urgent_flagged_by
            : currentUserDisplayName || currentUserId || "Administrator"
          : null,
      urgent_reminder_dismissed_at:
        nextIsUrgent && !assignmentChanged && !urgentFlagChanged
          ? ticket.urgent_reminder_dismissed_at ?? null
          : null,
      urgent_reminder_dismissed_by:
        nextIsUrgent && !assignmentChanged && !urgentFlagChanged
          ? ticket.urgent_reminder_dismissed_by ?? null
          : null,
      updated_at: new Date().toISOString(),
      ...(ticket.is_retail_sale
        ? {
            retail_sales_reference: nextRetailSalesReference.trim() || null,
            customer_name: nextCustomerName.trim() || null,
            customer_email: nextCustomerEmail.trim() || null,
            customer_phone: nextCustomerPhone.trim() || null,
            retail_delivery_method: nextRetailDeliveryMethod || null,
            retail_delivery_address: nextRetailDeliveryAddress.trim() || null,
            retail_apc_tracking_number: nextRetailApcTrackingNumber.trim() || null,
          }
        : {}),
    };

    const ticketPatchWithoutUrgency: Record<string, unknown> = { ...ticketPatch };
    delete ticketPatchWithoutUrgency.is_urgent;
    delete ticketPatchWithoutUrgency.urgent_flagged_at;
    delete ticketPatchWithoutUrgency.urgent_flagged_by;
    delete ticketPatchWithoutUrgency.urgent_reminder_dismissed_at;
    delete ticketPatchWithoutUrgency.urgent_reminder_dismissed_by;

    let { error: updateError } = await supabase
      .from("tickets")
      .update(ticketPatch)
      .eq("id", ticket.id);

    if (updateError && shouldRetryWithoutUrgentFields(updateError)) {
      const retryResult = await supabase
        .from("tickets")
        .update(ticketPatchWithoutUrgency)
        .eq("id", ticket.id);

      updateError = retryResult.error;
    }

    if (updateError) {
      setErrorMessage(
        sanitizeUserFacingError(updateError, "Unable to save ticket changes."),
      );
      setIsSavingEdit(false);
      return;
    }

    if (ticket.status !== ticketPatch.status) {
      const nextTicket = {
        ...ticket,
        ...ticketPatch,
        status: ticketPatch.status,
      } as TicketRecord;
      const isRetailOrder = Boolean(ticket.is_retail_sale);
      const supplierDispatchContact =
        !isRetailOrder && ticketPatch.status === "ORDERED"
          ? await loadSupplierDispatchContact(
              supabase,
              ticketPatch.supplier_name ?? ticket.supplier_name ?? "",
            )
          : null;
      const supplierDispatchPlan =
        !isRetailOrder && ticketPatch.status === "ORDERED"
          ? buildSupplierOrderDispatchPlan(
              nextTicket,
              supplierDispatchContact,
              confirmedWorkflow?.dispatchPreference ?? "none",
            )
          : null;

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
          comment: ticket.is_retail_sale
            ? buildRetailCustomerComment(nextTicket, "ordered")
            : buildOrderedWorkflowComment({
                expectedDeliveryDate: ticketPatch.expected_delivery_date,
                leadTimeNote: ticketPatch.lead_time_note,
                purchaseOrderNumber: ticketPatch.purchase_order_number,
                supplierName: ticketPatch.supplier_name,
                supplierEmail: ticketPatch.supplier_email,
                orderAmount: ticketPatch.order_amount,
                dispatchSummary: supplierDispatchPlan?.summary ?? null,
                actorName: currentUserDisplayName || currentUserId || "Stores Operator",
              }),
        });
      }

      if (workflowRequirement === "ready" && ticketPatch.bin_location) {
        ticketUpdateRows.push({
          ticket_id: ticket.id,
          comment: ticket.is_retail_sale
            ? buildRetailCustomerComment(nextTicket, "ready")
            : buildReadyWorkflowComment({
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
            retail_sales_reference: nextRetailSalesReference,
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
    const nextUpdatedTicket = {
      ...ticket,
      ...ticketPatch,
      status: ticketPatch.status,
    } as TicketRecord;
    const retailDispatchPlan =
      ticket.is_retail_sale && ticket.status !== ticketPatch.status && ticketPatch.status === "READY"
          ? buildRetailCustomerDispatchPlan(nextUpdatedTicket, "ready")
          : null;
    const supplierDispatchContact =
      !ticket.is_retail_sale && ticket.status !== ticketPatch.status && ticketPatch.status === "ORDERED"
        ? await loadSupplierDispatchContact(
            supabase,
            ticketPatch.supplier_name ?? ticket.supplier_name ?? "",
          )
        : null;
    const supplierDispatchPlan =
      !ticket.is_retail_sale && ticket.status !== ticketPatch.status && ticketPatch.status === "ORDERED"
        ? buildSupplierOrderDispatchPlan(
            nextUpdatedTicket,
            supplierDispatchContact,
            confirmedWorkflow?.dispatchPreference ?? "none",
          )
        : null;
    if (ticket.status !== ticketPatch.status && !ticket.is_retail_sale) {
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
    if (ticket.is_retail_sale && ticket.status !== ticketPatch.status && ticketPatch.status === "READY") {
      window.setTimeout(async () => {
        const dispatchPlan = retailDispatchPlan;

        if (dispatchPlan?.openInBrowser && dispatchPlan.recordsHref && dispatchPlan.channel === "whatsapp") {
          window.open(dispatchPlan.recordsHref, "_blank", "noopener,noreferrer");
        }

        if (dispatchPlan?.openInBrowser && dispatchPlan.customerHref) {
          if (dispatchPlan.channel === "whatsapp") {
            window.open(dispatchPlan.customerHref, "_blank", "noopener,noreferrer");
          } else {
            window.location.href = dispatchPlan.customerHref;
          }
        } else if (dispatchPlan?.openInBrowser && dispatchPlan.recordsHref) {
          if (dispatchPlan.channel === "whatsapp") {
            window.open(dispatchPlan.recordsHref, "_blank", "noopener,noreferrer");
          } else {
            window.location.href = dispatchPlan.recordsHref;
          }
        }
      }, 0);
    } else if (ticket.status !== ticketPatch.status && ticketPatch.status === "ORDERED") {
      window.setTimeout(async () => {
        const dispatchPlan = supplierDispatchPlan;

        if (dispatchPlan?.openInBrowser && dispatchPlan.recordsHref && dispatchPlan.channel === "whatsapp") {
          window.open(dispatchPlan.recordsHref, "_blank", "noopener,noreferrer");
        }

        if (dispatchPlan?.openInBrowser && dispatchPlan.supplierHref) {
          if (dispatchPlan.channel === "whatsapp") {
            window.open(dispatchPlan.supplierHref, "_blank", "noopener,noreferrer");
          } else {
            window.location.href = dispatchPlan.supplierHref;
          }
        } else if (dispatchPlan?.openInBrowser && dispatchPlan.recordsHref) {
          if (dispatchPlan.channel === "whatsapp") {
            window.open(dispatchPlan.recordsHref, "_blank", "noopener,noreferrer");
          } else {
            window.location.href = dispatchPlan.recordsHref;
          }
        }
      }, 0);
    }
    void loadTicket();
  }

  async function handleDismissUrgentReminder() {
    if (!ticket) {
      return;
    }

    if (!shouldShowUrgentReminder(ticket, currentUserDisplayName)) {
      setErrorMessage("Only the assigned user can dismiss this urgent reminder.");
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setErrorMessage("");

    const dismissedAt = new Date().toISOString();
    const dismissedBy = currentUserDisplayName || currentUserId || "Assigned user";

    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        urgent_reminder_dismissed_at: dismissedAt,
        urgent_reminder_dismissed_by: dismissedBy,
        updated_at: dismissedAt,
      })
      .eq("id", ticket.id);

    if (updateError) {
      setErrorMessage(
        sanitizeUserFacingError(updateError, "Unable to dismiss the urgent reminder."),
      );
      return;
    }

    setTicket((current) =>
      current
        ? {
            ...current,
            urgent_reminder_dismissed_at: dismissedAt,
            urgent_reminder_dismissed_by: dismissedBy,
            updated_at: dismissedAt,
          }
        : current,
    );
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

  async function handleAddPurchaseOrder() {
    if (!ticket) {
      return;
    }

    if (!isAdmin) {
      setPartNotice({
        type: "error",
        message: "Admin access is required to raise a purchase order.",
      });
      return;
    }

    if (!currentUserId) {
      setPartNotice({
        type: "error",
        message: "Unable to identify the current admin user.",
      });
      return;
    }

    const supplierName = purchaseOrderDraft.supplier_name.trim();
    const purchaseOrderNumber = purchaseOrderDraft.purchase_order_number.trim();
    const supplierEmail = purchaseOrderDraft.supplier_email.trim();
    const notes = purchaseOrderDraft.notes.trim();
    const parsedOrderAmount = purchaseOrderDraft.order_amount.trim()
      ? Number.parseFloat(purchaseOrderDraft.order_amount.trim())
      : null;

    if (!supplierName) {
      setPartNotice({
        type: "error",
        message: "Add a supplier name before saving.",
      });
      return;
    }

    if (!purchaseOrderNumber) {
      setPartNotice({
        type: "error",
        message: "Add a purchase order number before saving.",
      });
      return;
    }

    if (purchaseOrderDraft.order_amount.trim() && (parsedOrderAmount == null || Number.isNaN(parsedOrderAmount) || parsedOrderAmount < 0)) {
      setPartNotice({
        type: "error",
        message: "Enter a valid order amount or leave it blank.",
      });
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setPartNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setIsSavingPurchaseOrder(true);
    setPartNotice(null);

    try {
      const createdPurchaseOrder = await createTicketPurchaseOrder(supabase, {
        ticketId: ticket.id,
        createdBy: currentUserId,
        updatedBy: currentUserId,
        supplierName,
        purchaseOrderNumber,
        supplierEmail: supplierEmail || null,
        orderAmount: parsedOrderAmount,
        poStatus: purchaseOrderDraft.po_status,
        notes: notes || null,
      });

      setPurchaseOrders((current) => [createdPurchaseOrder, ...current]);
      setPurchaseOrderDraft(buildEmptyTicketPurchaseOrderDraft());
      setPartNotice({
        type: "success",
        message: "Purchase order added to this ticket.",
      });
    } catch (purchaseOrderError) {
      setPartNotice({
        type: "error",
        message: sanitizeUserFacingError(
          purchaseOrderError,
          "Unable to add this purchase order right now.",
        ),
      });
    } finally {
      setIsSavingPurchaseOrder(false);
    }
  }

  async function handleAddTicketPart() {
    if (!ticket) {
      return;
    }

    if (!isAdmin) {
      setPartNotice({
        type: "error",
        message: "Admin access is required to link parts to a ticket.",
      });
      return;
    }

    if (!currentUserId) {
      setPartNotice({
        type: "error",
        message: "Unable to identify the current admin user.",
      });
      return;
    }

    const partDescription = partDraft.part_description.trim();
    const partNumber = partDraft.part_number.trim();
    const supplierName = partDraft.supplier_name.trim();
    const notes = partDraft.notes.trim();
    const parsedQuantity = Number.parseInt(partDraft.quantity.trim(), 10);
    const selectedPurchaseOrderId = partDraft.ticket_purchase_order_id.trim();

    if (!partDescription) {
      setPartNotice({
        type: "error",
        message: "Add a part description before saving.",
      });
      return;
    }

    if (!partNumber) {
      setPartNotice({
        type: "error",
        message: "Add a part number before saving.",
      });
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
      setPartNotice({
        type: "error",
        message: "Quantity must be a positive whole number.",
      });
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setPartNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
      });
      return;
    }

    setIsSavingPart(true);
    setPartNotice(null);

    try {
      const createdPart = await createTicketPart(supabase, {
        ticketId: ticket.id,
        createdBy: currentUserId,
        updatedBy: currentUserId,
        jobNumber: ticket.job_number,
        machineReference: ticket.machine_reference,
        purchaseOrderId: selectedPurchaseOrderId || null,
        machineMake: ticket.machine_make,
        machineModel: ticket.machine_model,
        partDescription,
        partNumber,
        quantity: parsedQuantity,
        partStatus: partDraft.part_status,
        supplierName: supplierName || null,
        notes: notes || null,
      });

      setTicketParts((current) => [createdPart, ...current]);
      setPartDraft(buildEmptyTicketPartDraft());
      setPartNotice({
        type: "success",
        message: "Linked part added to this ticket.",
      });
    } catch (partError) {
      setPartNotice({
        type: "error",
        message: sanitizeUserFacingError(partError, "Unable to add this part right now."),
      });
    } finally {
      setIsSavingPart(false);
    }
  }

  function handleApplyTakeuchiSuggestion(part: {
    part_description: string;
    part_number: string;
    suggested_part_number?: string | null;
    bom_main_group: string;
    bom_sub_group: string;
  }) {
    setPartDraft((current) => ({
      ...current,
      part_description: part.part_description,
      part_number: part.suggested_part_number || part.part_number,
    }));
    setPartNotice({
      type: "success",
      message: `Applied Takeuchi suggestion from ${part.bom_main_group} · ${part.bom_sub_group}. Review the form and save it below.`,
    });
    partFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <AuthGuard>
      <ConsoleShell
        eyebrow={isAdmin ? "Operations / ticket" : "My requests / ticket"}
        title={ticket?.job_number ? `Job ${ticket.job_number}` : "Ticket workspace"}
      >
          {statusWorkflowDialog ? (
            <TicketStatusWorkflowModal
              mode={statusWorkflowDialog.mode}
              isRetailSale={Boolean(ticket?.is_retail_sale)}
              isSubmitting={isSavingEdit}
              expectedDeliveryDate={statusWorkflowDialog.expectedDeliveryDate}
              leadTimeNote={statusWorkflowDialog.leadTimeNote}
              purchaseOrderNumber={statusWorkflowDialog.purchaseOrderNumber}
              supplierName={statusWorkflowDialog.supplierName}
              supplierEmail={statusWorkflowDialog.supplierEmail}
              orderAmount={statusWorkflowDialog.orderAmount}
              binLocation={statusWorkflowDialog.binLocation}
              retailSalesReference={statusWorkflowDialog.retailSalesReference}
              dispatchPreference={statusWorkflowDialog.dispatchPreference}
              customerName={statusWorkflowDialog.customerName}
              customerEmail={statusWorkflowDialog.customerEmail}
              customerPhone={statusWorkflowDialog.customerPhone}
              retailDeliveryMethod={statusWorkflowDialog.retailDeliveryMethod}
              retailDeliveryAddress={statusWorkflowDialog.retailDeliveryAddress}
              retailApcTrackingNumber={statusWorkflowDialog.retailApcTrackingNumber}
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
              onDispatchPreferenceChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, dispatchPreference: value, errorMessage: "" } : current,
                )
              }
              onRetailSalesReferenceChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, retailSalesReference: value, errorMessage: "" } : current,
                )
              }
              onCustomerNameChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, customerName: value, errorMessage: "" } : current,
                )
              }
              onCustomerEmailChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, customerEmail: value, errorMessage: "" } : current,
                )
              }
              onCustomerPhoneChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, customerPhone: value, errorMessage: "" } : current,
                )
              }
              onRetailDeliveryMethodChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, retailDeliveryMethod: value, errorMessage: "" } : current,
                )
              }
              onRetailDeliveryAddressChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, retailDeliveryAddress: value, errorMessage: "" } : current,
                )
              }
              onRetailApcTrackingNumberChange={(value) =>
                setStatusWorkflowDialog((current) =>
                  current ? { ...current, retailApcTrackingNumber: value, errorMessage: "" } : current,
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
                  dispatchPreference: dialog.dispatchPreference,
                  customerName: dialog.customerName,
                  customerEmail: dialog.customerEmail,
                  customerPhone: dialog.customerPhone,
                  retailDeliveryMethod: dialog.retailDeliveryMethod,
                  retailDeliveryAddress: dialog.retailDeliveryAddress,
                  retailApcTrackingNumber: dialog.retailApcTrackingNumber,
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
          {isEditing ? (
            <button
              type="button"
              className="ticket-edit-drawer-scrim"
              aria-label="Close edit drawer"
              onClick={handleEditToggle}
            />
          ) : null}
          <section className="ticket-workspace">
            <div className="ticket-workspace-header">
              <div>
                <p className="console-section-label">Request record</p>
                <h1>
                  {ticket?.request_summary?.trim() ||
                    ticket?.request_details?.trim() ||
                    "Ticket detail"}
                </h1>
                <p>
                  {ticket?.machine_reference?.trim() || "No machine reference"}
                  {ticket?.requester_name ? ` · Requested by ${ticket.requester_name}` : ""}
                </p>
              </div>
              <div className="ticket-workspace-actions">
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={handleEditToggle}
                      className="console-primary-compact-action"
                    >
                      Edit ticket
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void loadTicket()}
                    disabled={isLoading}
                    className="console-secondary-compact-action"
                  >
                    <ConsoleIcon name="refresh" className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                    {isLoading ? "Refreshing..." : "Refresh"}
                  </button>
                  <Link
                    href={isAdmin ? "/console" : "/requests"}
                    className="console-secondary-compact-action"
                  >
                    Back to queue
                  </Link>
              </div>
            </div>

            <nav className="ticket-workspace-tabs" aria-label="Ticket workspace sections">
              {workspaceTabs.map((tab) => {
                const count =
                  tab.id === "parts"
                    ? ticketParts.length + purchaseOrders.length
                    : tab.id === "activity"
                      ? updates.length
                      : tab.id === "conversation"
                        ? messages.length
                        : tab.id === "files"
                          ? attachments.length
                          : null;

                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveWorkspaceTab(tab.id)}
                    className={activeWorkspaceTab === tab.id ? "ticket-workspace-tab-active" : undefined}
                    aria-pressed={activeWorkspaceTab === tab.id}
                  >
                    <ConsoleIcon name={tab.icon} className="h-4 w-4" />
                    <span>{tab.label}</span>
                    {count !== null ? <strong>{count}</strong> : null}
                  </button>
                );
              })}
            </nav>

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
                <div className="grid gap-6">
                  <section
                    className={
                      activeWorkspaceTab === "overview" ||
                      activeWorkspaceTab === "parts" ||
                      isEditing
                        ? "ticket-workspace-panel"
                        : "hidden"
                    }
                  >
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

                    {ticket.is_urgent && !ticket.urgent_reminder_dismissed_at ? (
                      <div className="mt-5 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-4 text-red-950">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">
                              Urgent reminder
                            </p>
                            <p className="text-sm leading-6 text-red-900">
                              This request has been flagged urgent.
                              {ticket.assigned_to ? ` Assigned to ${ticket.assigned_to}.` : " It still needs an assigned user."}
                              {ticket.urgent_flagged_by ? ` Flagged by ${ticket.urgent_flagged_by}.` : ""}
                            </p>
                          </div>
                          {shouldShowUrgentReminder(ticket, currentUserDisplayName) ? (
                            <button
                              type="button"
                              onClick={() => void handleDismissUrgentReminder()}
                              className="inline-flex h-10 items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-100"
                            >
                              Dismiss reminder
                            </button>
                          ) : (
                            <span className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-100 px-4 text-sm font-semibold text-red-700">
                              Awaiting assigned user
                            </span>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {isAdmin && isEditing && editDraft ? (
                      <aside className="ticket-edit-drawer" role="dialog" aria-modal="true" aria-label="Edit ticket">
                        <div className="ticket-edit-drawer-header">
                          <div>
                            <p>Edit request</p>
                            <h2>Job {ticket.job_number?.trim() || "—"}</h2>
                          </div>
                          <button
                            type="button"
                            className="console-icon-button"
                            onClick={handleEditToggle}
                            aria-label="Close edit drawer"
                          >
                            <ConsoleIcon name="close" className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="ticket-edit-drawer-body space-y-5">
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
                          <label className="space-y-2 sm:col-span-2">
                            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                              Requester visibility
                            </span>
                            <select
                              value={editDraft.visible_to_user_id}
                              onChange={(event) =>
                                setEditDraft((current) =>
                                  current
                                    ? { ...current, visible_to_user_id: event.target.value }
                                    : current,
                                )
                              }
                              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                            >
                              <option value="">Original requester only</option>
                              {requesterAccounts.map((account) => (
                                <option key={account.user_id} value={account.user_id}>
                                  {account.full_name ?? account.user_id}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="sm:col-span-2 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-red-950">
                                  Urgent flag
                                </p>
                                <p className="mt-1 text-xs leading-6 text-red-800">
                                  Keeps the request pinned in the active queue and shows a persistent reminder to the assigned user.
                                </p>
                              </div>
                              <label className="inline-flex items-center gap-3 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700">
                                <input
                                  type="checkbox"
                                  checked={editDraft.is_urgent}
                                  onChange={(event) =>
                                    setEditDraft((current) =>
                                      current
                                        ? { ...current, is_urgent: event.target.checked }
                                        : current,
                                    )
                                  }
                                  className="h-4 w-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                                />
                                Mark urgent
                              </label>
                            </div>
                          </div>
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
                          {ticket.is_retail_sale ? (
                            <>
                              <EditField
                                label="Sales Reference"
                                value={editDraft.retail_sales_reference}
                                onChange={(value) =>
                                  setEditDraft((current) =>
                                    current ? { ...current, retail_sales_reference: value } : current,
                                  )
                                }
                              />
                              <EditField
                                label="Customer Name"
                                value={editDraft.customer_name}
                                onChange={(value) =>
                                  setEditDraft((current) =>
                                    current ? { ...current, customer_name: value } : current,
                                  )
                                }
                              />
                              <EditField
                                label="Customer Email"
                                value={editDraft.customer_email}
                                onChange={(value) =>
                                  setEditDraft((current) =>
                                    current ? { ...current, customer_email: value } : current,
                                  )
                                }
                              />
                              <EditField
                                label="Customer Phone"
                                value={editDraft.customer_phone}
                                onChange={(value) =>
                                  setEditDraft((current) =>
                                    current ? { ...current, customer_phone: value } : current,
                                  )
                                }
                              />
                              <EditSelect
                                label="Delivery Method"
                                value={editDraft.retail_delivery_method}
                                options={["collect", "delivery"]}
                                onChange={(value) =>
                                  setEditDraft((current) =>
                                    current ? { ...current, retail_delivery_method: value as "" | RetailDeliveryMethod } : current,
                                  )
                                }
                              />
                              {editDraft.retail_delivery_method === "delivery" ? (
                                <>
                                  <div className="sm:col-span-2">
                                    <EditArea
                                      label="Delivery Address"
                                      value={editDraft.retail_delivery_address}
                                      onChange={(value) =>
                                        setEditDraft((current) =>
                                          current
                                            ? { ...current, retail_delivery_address: value }
                                            : current,
                                        )
                                      }
                                    />
                                  </div>
                                  <EditField
                                    label="APC Tracking Number"
                                    value={editDraft.retail_apc_tracking_number}
                                    onChange={(value) =>
                                      setEditDraft((current) =>
                                        current
                                          ? { ...current, retail_apc_tracking_number: value }
                                          : current,
                                      )
                                    }
                                  />
                                </>
                              ) : null}
                            </>
                          ) : null}
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

                        <div className="ticket-edit-drawer-actions">
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
                      </aside>
                    ) : (
                      <>
                        <div className={activeWorkspaceTab === "overview" ? "" : "hidden"}>
                          <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                          {!ticket.is_retail_sale ? (
                            <>
                              <DetailItem label="Requester" value={ticket.requester_name} />
                              <DetailItem label="Department" value={ticket.department} />
                              <DetailItem label="Machine" value={ticket.machine_reference} />
                              <DetailItem label="Job Number" value={ticket.job_number} />
                            </>
                          ) : (
                            <>
                              <DetailItem label="Retail Sale" value="Yes" />
                              <DetailItem label="Sales Reference" value={ticket.retail_sales_reference} />
                              <DetailItem label="Customer Name" value={ticket.customer_name} />
                            </>
                          )}
                          <DetailItem label="Assigned User" value={ticket.assigned_to} />
                          <DetailItem label="Expected Delivery" value={formatOperationalDate(ticket.expected_delivery_date)} />
                          <DetailItem label="PO Number" value={ticket.purchase_order_number} />
                          <DetailItem label="Supplier" value={ticket.supplier_name} />
                          <DetailItem label="Supplier Email" value={ticket.supplier_email} />
                          <DetailItem label="Order Amount" value={formatOrderAmount(ticket.order_amount)} />
                          <DetailItem label="Bin Location" value={ticket.bin_location} />
                          <DetailItem label="Lead Time Note" value={ticket.lead_time_note} />
                          {ticket.is_retail_sale ? (
                            <>
                              <DetailItem label="Customer Email" value={ticket.customer_email} />
                              <DetailItem label="Customer Phone" value={ticket.customer_phone} />
                              <DetailItem label="Delivery Method" value={ticket.retail_delivery_method} />
                              <DetailItem label="Delivery Address" value={ticket.retail_delivery_address} />
                              <DetailItem label="APC Tracking Number" value={ticket.retail_apc_tracking_number} />
                            </>
                          ) : null}
                          <DetailItem
                            label="Updated"
                            value={formatDate(ticket.updated_at)}
                          />
                          </dl>

                        {!ticket.is_retail_sale ? (
                          <div className="mt-6">
                            <MachineDetailsCard ticket={ticket} />
                          </div>
                        ) : null}

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
                        </div>
                        <div className={activeWorkspaceTab === "parts" ? "" : "hidden"}>
                        <section
                          id="purchase-orders"
                          className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Separate Purchase Orders
                              </p>
                              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                                Raise one or more POs per request
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                Use this when one job needs parts from multiple suppliers. Each PO is stored against the ticket and can be linked back to one or more parts.
                              </p>
                            </div>
                            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                              {purchaseOrders.length} raised
                            </div>
                          </div>

                          {purchaseOrders.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                              No purchase orders have been raised yet for this ticket.
                            </div>
                          ) : (
                            <div className="mt-4 grid gap-3">
                              {purchaseOrders.map((po) => (
                                <article key={po.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-950">
                                        PO {po.purchase_order_number}
                                      </p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        {po.supplier_name}
                                        {po.supplier_email ? ` · ${po.supplier_email}` : ""}
                                      </p>
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                      {formatTicketPurchaseOrderStatus(po.po_status)}
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                    <p>
                                      Amount: <span className="font-medium text-slate-900">{formatOrderAmount(po.order_amount)}</span>
                                    </p>
                                    <p>
                                      Parts linked: <span className="font-medium text-slate-900">
                                        {ticketParts.filter((part) => part.ticket_purchase_order_id === po.id).length}
                                      </span>
                                    </p>
                                    {po.notes ? (
                                      <p className="sm:col-span-2 leading-6">{po.notes}</p>
                                    ) : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}

                          {isAdmin ? (
                            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    Add purchase order
                                  </p>
                                  <p className="mt-1 text-sm leading-6 text-slate-600">
                                    Create a supplier-specific PO for this request before linking one or more parts to it.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Supplier
                                  </span>
                                  <input
                                    value={purchaseOrderDraft.supplier_name}
                                    onChange={(event) =>
                                      setPurchaseOrderDraft((current) => ({
                                        ...current,
                                        supplier_name: event.target.value,
                                      }))
                                    }
                                    placeholder="Supplier name"
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    PO Number
                                  </span>
                                  <input
                                    value={purchaseOrderDraft.purchase_order_number}
                                    onChange={(event) =>
                                      setPurchaseOrderDraft((current) => ({
                                        ...current,
                                        purchase_order_number: event.target.value,
                                      }))
                                    }
                                    placeholder="PO-0001"
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Supplier Email
                                  </span>
                                  <input
                                    value={purchaseOrderDraft.supplier_email}
                                    onChange={(event) =>
                                      setPurchaseOrderDraft((current) => ({
                                        ...current,
                                        supplier_email: event.target.value,
                                      }))
                                    }
                                    placeholder="orders@supplier.example"
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    PO Status
                                  </span>
                                  <select
                                    value={purchaseOrderDraft.po_status}
                                    onChange={(event) =>
                                      setPurchaseOrderDraft((current) => ({
                                        ...current,
                                        po_status: event.target.value as TicketPurchaseOrderStatus,
                                      }))
                                    }
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  >
                                    {ticketPurchaseOrderStatuses.map((status) => (
                                      <option key={status} value={status}>
                                        {formatTicketPurchaseOrderStatus(status)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Amount
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={purchaseOrderDraft.order_amount}
                                    onChange={(event) =>
                                      setPurchaseOrderDraft((current) => ({
                                        ...current,
                                        order_amount: event.target.value,
                                      }))
                                    }
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Notes
                                  </span>
                                  <textarea
                                    value={purchaseOrderDraft.notes}
                                    onChange={(event) =>
                                      setPurchaseOrderDraft((current) => ({
                                        ...current,
                                        notes: event.target.value,
                                      }))
                                    }
                                    rows={3}
                                    placeholder="Lead time, order split, backorder, or call notes"
                                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                              </div>
                              <div className="mt-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => void handleAddPurchaseOrder()}
                                  disabled={isSavingPurchaseOrder}
                                  className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingPurchaseOrder ? "Saving..." : "Raise PO"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </section>

                        <section
                          id="parts"
                          className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                Linked Parts
                              </p>
                              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                                Parts catalogue seed for this job
                              </h3>
                              <p className="mt-1 text-sm leading-6 text-slate-600">
                                Each part record stays tied to the ticket, job number, machine reference, and optionally a specific PO.
                              </p>
                            </div>
                            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                              {ticketParts.length} linked
                            </div>
                          </div>

                          {ticketParts.length === 0 ? (
                            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                              No linked parts yet. Press the + button from compact view, or add the first part below.
                            </div>
                          ) : (
                            <div className="mt-4 grid gap-3">
                              {ticketParts.map((part) => (
                                <article
                                  key={part.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-slate-950">
                                        {part.part_description}
                                      </p>
                                      <p className="mt-1 text-sm text-slate-600">
                                        Part <span className="font-medium text-slate-900">{part.part_number}</span>
                                        {" "}· Qty {part.quantity}
                                      </p>
                                    </div>
                                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                                      {formatTicketPartStatus(part.part_status)}
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                    <p>
                                      Machine: <span className="font-medium text-slate-900">{part.machine_reference ?? ticket.machine_reference ?? "-"}</span>
                                    </p>
                                    <p>
                                      Job: <span className="font-medium text-slate-900">{part.job_number ?? ticket.job_number ?? "-"}</span>
                                    </p>
                                    <p className="sm:col-span-2">
                                      PO:{" "}
                                      <span className="font-medium text-slate-900">
                                        {purchaseOrders.find((po) => po.id === part.ticket_purchase_order_id)?.purchase_order_number ?? "-"}
                                      </span>
                                    </p>
                                    {part.supplier_name ? (
                                      <p className="sm:col-span-2">
                                        Supplier: <span className="font-medium text-slate-900">{part.supplier_name}</span>
                                      </p>
                                    ) : null}
                                    {part.notes ? (
                                      <p className="sm:col-span-2 leading-6">
                                        {part.notes}
                                      </p>
                                    ) : null}
                                  </div>
                                </article>
                              ))}
                            </div>
                          )}

                          <TakeuchiPartSuggestions
                            ticket={{
                              machine_make: ticket.machine_make,
                              machine_model: ticket.machine_model,
                              machine_serial_number: ticket.machine_serial_number,
                              machine_verified: ticket.machine_verified,
                              request_summary: ticket.request_summary,
                              request_details: ticket.request_details,
                            }}
                            isAdmin={isAdmin}
                            onApplySuggestion={handleApplyTakeuchiSuggestion}
                          />

                          {isAdmin ? (
                            <div ref={partFormRef} className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">
                                    Add linked part
                                  </p>
                                  <p className="mt-1 text-sm leading-6 text-slate-600">
                                    Capture the requested part number now so the same machine, job, and PO can grow into a better catalogue over time.
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Part Description
                                  </span>
                                  <input
                                    value={partDraft.part_description}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        part_description: event.target.value,
                                      }))
                                    }
                                    placeholder="Steering pin bushes"
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Part Number
                                  </span>
                                  <input
                                    value={partDraft.part_number}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        part_number: event.target.value,
                                      }))
                                    }
                                    placeholder="PN-1111"
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Quantity
                                  </span>
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={partDraft.quantity}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        quantity: event.target.value,
                                      }))
                                    }
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Part Status
                                  </span>
                                  <select
                                    value={partDraft.part_status}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        part_status: event.target.value as TicketPartStatus,
                                      }))
                                    }
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  >
                                    {ticketPartStatuses.map((status) => (
                                      <option key={status} value={status}>
                                        {formatTicketPartStatus(status)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Linked PO
                                  </span>
                                  <select
                                    value={partDraft.ticket_purchase_order_id}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        ticket_purchase_order_id: event.target.value,
                                      }))
                                    }
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  >
                                    <option value="">No PO assigned yet</option>
                                    {purchaseOrders.map((po) => (
                                      <option key={po.id} value={po.id}>
                                        {po.purchase_order_number} · {po.supplier_name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Supplier
                                  </span>
                                  <input
                                    value={partDraft.supplier_name}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        supplier_name: event.target.value,
                                      }))
                                    }
                                    placeholder="Source supplier or branch"
                                    className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                                <label className="block sm:col-span-2">
                                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Notes
                                  </span>
                                  <textarea
                                    value={partDraft.notes}
                                    onChange={(event) =>
                                      setPartDraft((current) => ({
                                        ...current,
                                        notes: event.target.value,
                                      }))
                                    }
                                    rows={3}
                                    placeholder="Any fitment, sourcing, or cross-reference notes"
                                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                                  />
                                </label>
                              </div>

                              {partNotice ? (
                                <div
                                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                                    partNotice.type === "success"
                                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border border-rose-200 bg-rose-50 text-rose-700"
                                  }`}
                                >
                                  {partNotice.message}
                                </div>
                              ) : null}

                              <div className="mt-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => void handleAddTicketPart()}
                                  disabled={isSavingPart}
                                  className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingPart ? "Saving..." : "Add Part"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </section>
                        </div>
                        <div className={activeWorkspaceTab === "overview" ? "" : "hidden"}>
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
                        </div>
                      </>
                    )}
                  </section>

                  <section
                    className={activeWorkspaceTab === "activity" ? "ticket-workspace-panel" : "hidden"}
                  >
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

                <div className={activeWorkspaceTab === "files" ? "ticket-tab-surface" : "hidden"}>
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
                </div>

                <div className={activeWorkspaceTab === "conversation" ? "ticket-tab-surface" : "hidden"}>
                  <TicketChatPanel
                  ticketId={ticket.id}
                  ticketLabel={ticket.is_retail_sale ? ticket.customer_name ?? "Retail order" : ticket.job_number}
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
              </div>
            ) : (
              <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Ticket not found.
              </div>
            )}
          </section>
      </ConsoleShell>
    </AuthGuard>
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
    visible_to_user_id: ticket.visible_to_user_id ?? "",
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
    retail_sales_reference: ticket.retail_sales_reference ?? "",
    customer_name: ticket.customer_name ?? "",
    customer_email: ticket.customer_email ?? "",
    customer_phone: ticket.customer_phone ?? "",
    retail_delivery_method: ticket.retail_delivery_method ?? "",
    retail_delivery_address: ticket.retail_delivery_address ?? "",
    retail_apc_tracking_number: ticket.retail_apc_tracking_number ?? "",
    is_urgent: Boolean(ticket.is_urgent),
  };
}

function shouldConfirmAdminEdit(
  ticket: TicketRecord,
  currentUserDisplayName: string | null,
) {
  const assignedTo = ticket.assigned_to?.trim() ?? "";
  const isSameOperator = isLikelySameOperatorName(assignedTo, currentUserDisplayName);

  if (assignedTo && !isSameOperator) {
    return true;
  }

  return ticket.status === "IN_PROGRESS" && Boolean(assignedTo) && !isSameOperator;
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

function MachineDetailsCard({ ticket }: { ticket: TicketRecord }) {
  const hasMachineSnapshot =
    Boolean(ticket.machine_verified) ||
    Boolean(ticket.machine_number?.trim()) ||
    Boolean(ticket.machine_make?.trim()) ||
    Boolean(ticket.machine_model?.trim()) ||
    Boolean(ticket.machine_serial_number?.trim());

  if (!hasMachineSnapshot) {
    return null;
  }

  const verified = Boolean(ticket.machine_verified);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Machine Details
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Snapshot captured from the fleet registry when the ticket was submitted.
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
            verified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {verified ? "Verified" : "Unverified"}
        </span>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        <DetailItem label="Machine Number" value={ticket.machine_number ?? ticket.machine_reference} />
        <DetailItem label="Fleet Type" value={ticket.machine_fleet_type} />
        <DetailItem label="Make" value={ticket.machine_make} />
        <DetailItem label="Model" value={ticket.machine_model} />
        <DetailItem label="Serial Number" value={ticket.machine_serial_number} />
        <DetailItem
          label="Quantity"
          value={ticket.machine_quantity != null ? String(ticket.machine_quantity) : null}
        />
        <DetailItem label="Verified At" value={formatDateTime(ticket.machine_verified_at)} />
      </dl>

      {!verified ? (
        <p className="mt-4 text-sm leading-6 text-slate-500">
          The machine has not matched a fleet record yet, but the ticket can still be processed.
        </p>
      ) : null}
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
