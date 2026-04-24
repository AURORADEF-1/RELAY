"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminOversightInbox, type AdminOversightItem } from "@/components/admin-oversight-inbox";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { AdminSmartSearchPanel } from "@/components/admin-smart-search-panel";
import { PartsOrdersDashboard } from "@/components/parts-orders-dashboard";
import { PartsQueriesPanel } from "@/components/parts-queries-panel";
import { PartsControlTabs } from "@/components/parts-control-tabs";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import { OverdueOrderedRemindersModal } from "@/components/overdue-ordered-reminders-modal";
import { TicketStatusWorkflowModal } from "@/components/ticket-status-workflow-modal";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import {
  ADMIN_OPERATOR_OPTIONS,
} from "@/lib/admin-operators";
import {
  buildOnsiteLocationMapUrl,
  formatOnsiteLocationSummary,
} from "@/lib/onsite-location";
import {
  buildOrdersCsvContent,
  buildReadyOrdersMailto,
  buildSupplierOrderMailto,
} from "@/lib/order-communications";
import {
  backfillMonthlySupplierSpendSnapshots,
  fetchMonthlySupplierSpendSnapshots,
  syncMonthlySupplierSpendSnapshotsForMonth,
} from "@/lib/monthly-supplier-spend";
import {
  type ChatMessage,
  TicketChatPanel,
} from "@/components/ticket-chat-panel";
import {
  createTicketMessage,
  deleteTicketAttachmentsForTicket,
  fetchTicketAttachments,
  fetchTicketMessages,
  type TicketAttachmentRecord,
  type TicketMessageRecord,
  uploadTicketAttachments,
} from "@/lib/relay-ticketing";
import type { RelayAiContext } from "@/lib/relay-ai";
import type { SmartSearchResponse, SmartSearchResult, SmartSearchScope } from "@/lib/admin-smart-search";
import {
  notifyRequesterOfOperatorMessage,
  notifyRequesterStatusChanged,
} from "@/lib/notifications";
import {
  buildOrderedWorkflowComment,
  buildReadyWorkflowComment,
  formatOperationalDate,
  formatOrderAmount,
  getStatusWorkflowRequirement,
  isTicketOrderOverdue,
  isTrackedOrderRecord,
  parseOrderAmountInput,
  parseDueDateToEndOfDay,
  toDateInputValue,
} from "@/lib/ticket-operational";
import {
  getOrdersFilterStatuses,
  type OrdersFilterKey,
} from "@/lib/order-analytics";
import { fetchProfileAvatarUrls } from "@/lib/profile-settings";
import {
  fetchProfileDisplayNamesByUserId,
  getCurrentUserWithRole,
} from "@/lib/profile-access";
import {
  extractRequesterReturnReason,
  REQUESTER_COLLECTED_COMMENT,
} from "@/lib/requester-ticket-actions";
import { sanitizeUserFacingError } from "@/lib/security";
import { formatSupplierDisplayName, normalizeSupplierEmail } from "@/lib/suppliers";
import {
  activeTicketStatusOptions,
  activeTicketStatuses,
  type ActiveTicketStatusFilter,
  type TicketStatus,
} from "@/lib/statuses";
import { triggerActionFeedback } from "@/lib/action-feedback";
import { getSupabaseClient } from "@/lib/supabase";
import { getSupabaseAccessToken } from "@/lib/supabase";

const ADMIN_CHAT_READ_STORAGE_KEY = "relay-admin-chat-last-opened";
const ADMIN_DASHBOARD_VIEW_STORAGE_KEY = "relay-admin-dashboard-view-mode";
const ADMIN_PAGE_SIZE_OPTIONS = [15, 25, 50] as const;
const OVERSIGHT_PENDING_DELAY_MS = 60_000;
const OVERSIGHT_TIMER_INTERVAL_MS = 30_000;
const ADMIN_TICKET_REFRESH_DEBOUNCE_MS = 500;
const REQUESTER_MESSAGE_OVERSIGHT_PREFIX = "requester-message";

function clampOversightMessage(value: string, maxLength: number) {
  const trimmed = value.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

type Ticket = {
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
  request_summary: string | null;
  request_details: string | null;
  status: TicketStatus | null;
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
  created_at?: string | null;
  updated_at?: string | null;
};

type StatusWorkflowDialogState = {
  ticketId: string;
  mode: "ordered" | "ready";
  nextStatus: TicketStatus;
  expectedDeliveryDate: string;
  leadTimeNote: string;
  purchaseOrderNumber: string;
  supplierName: string;
  supplierEmail: string;
  orderAmount: string;
  binLocation: string;
  errorMessage: string;
};

const ORDERED_WORKFLOW_MIGRATION_HINT =
  "ORDERED workflow fields are not available in the database yet. Apply docs/tickets-ordered-ready-operational-fields-2026-03-28.sql and try again.";

export default function AdminPage() {
  const router = useRouter();
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();
  const loadTicketsRequestIdRef = useRef(0);
  const requesterMessagesRequestIdRef = useRef(0);
  const chatLoadRequestIdRef = useRef(0);
  const adminTicketRefreshTimeoutRef = useRef<number | null>(null);
  const requesterMessageRefreshTimeoutRef = useRef<number | null>(null);
  const activeTicketOperationIdsRef = useRef<Set<string>>(new Set());
  const [isKpiMinimized, setIsKpiMinimized] = useState(false);
  const [assignedUserFilter, setAssignedUserFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<"ALL" | "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS">(
    "ALL",
  );
  const [departmentFilter, setDepartmentFilter] = useState<"ALL" | "Onsite" | "Yard">("ALL");
  const [statusFilter, setStatusFilter] = useState<ActiveTicketStatusFilter>("ALL");
  const [pageSize, setPageSize] = useState<(typeof ADMIN_PAGE_SIZE_OPTIONS)[number]>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"table" | "compact" | "dynamic">(() => {
    if (typeof window === "undefined") {
      return "table";
    }

    const saved = window.sessionStorage.getItem(ADMIN_DASHBOARD_VIEW_STORAGE_KEY);
    if (saved === "compact" || saved === "dynamic") {
      return saved;
    }

    return "table";
  });
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [collectedTicketIds, setCollectedTicketIds] = useState<Set<string>>(new Set());
  const [returnedTicketReasonById, setReturnedTicketReasonById] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, { assigned_to: string; notes: string }>>(
    {},
  );
  const [selectedChatTicketId, setSelectedChatTicketId] = useState<string | null>(null);
  const [chatAttachments, setChatAttachments] = useState<TicketAttachmentRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<TicketMessageRecord[]>([]);
  const [chatSenderNameByUserId, setChatSenderNameByUserId] = useState<Record<string, string>>({});
  const [requesterMessagesByTicket, setRequesterMessagesByTicket] = useState<
    Record<string, TicketMessageRecord[]>
  >({});
  const [readRequesterMessageByTicket, setReadRequesterMessageByTicket] = useState<
    Record<string, string>
  >({});
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatSending, setIsChatSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [chatNotice, setChatNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [resourceTab, setResourceTab] = useState<"operations" | "search" | "orders" | "queries" | "guide" | "faq">(
    "operations",
  );
  const [smartSearchQuery, setSmartSearchQuery] = useState("");
  const [smartSearchResults, setSmartSearchResults] = useState<SmartSearchResult[]>([]);
  const [smartSearchScope, setSmartSearchScope] = useState<SmartSearchScope>("live");
  const [isSmartSearchLoading, setIsSmartSearchLoading] = useState(false);
  const [smartSearchErrorMessage, setSmartSearchErrorMessage] = useState("");
  const [orders, setOrders] = useState<Ticket[]>([]);
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilterKey>("live");
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersErrorMessage, setOrdersErrorMessage] = useState("");
  const [ordersNotice, setOrdersNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [monthlySpendSnapshots, setMonthlySpendSnapshots] = useState<
    Array<{
      id?: string;
      month_start: string;
      supplier_name: string;
      supplier_name_normalized: string;
      order_count: number;
      total_spend: number;
      generated_at: string;
    }>
  >([]);
  const [selectedSpendMonth, setSelectedSpendMonth] = useState<string>("");
  const [dismissedOversightIds, setDismissedOversightIds] = useState<string[]>([]);
  const [isBackfillingMonthlySpend, setIsBackfillingMonthlySpend] = useState(false);
  const [oversightNow, setOversightNow] = useState(() => Date.now());
  const [profileAvatarByUserId, setProfileAvatarByUserId] = useState<Record<string, string | null>>({});
  const [activeTicketOperationIds, setActiveTicketOperationIds] = useState<Set<string>>(new Set());
  const [statusWorkflowDialog, setStatusWorkflowDialog] = useState<StatusWorkflowDialogState | null>(null);
  const [dismissingOverdueTicketId, setDismissingOverdueTicketId] = useState<string | null>(null);

  const getLatestRequesterMessage = useCallback(
    (ticketId: string) => {
      const messages = requesterMessagesByTicket[ticketId] ?? [];
      return messages[messages.length - 1] ?? null;
    },
    [requesterMessagesByTicket],
  );

  const updateTicketDraft = useCallback((ticketId: string, patch: Partial<{ assigned_to: string; notes: string }>) => {
    setDrafts((current) => ({
      ...current,
      [ticketId]: {
        assigned_to: patch.assigned_to ?? current[ticketId]?.assigned_to ?? "",
        notes: patch.notes ?? current[ticketId]?.notes ?? "",
      },
    }));
  }, []);

  const beginTicketOperation = useCallback((ticketId: string) => {
    if (activeTicketOperationIdsRef.current.has(ticketId)) {
      return false;
    }

    const next = new Set(activeTicketOperationIdsRef.current);
    next.add(ticketId);
    activeTicketOperationIdsRef.current = next;
    setActiveTicketOperationIds(next);
    return true;
  }, []);

  const finishTicketOperation = useCallback((ticketId: string) => {
    if (!activeTicketOperationIdsRef.current.has(ticketId)) {
      return;
    }

    const next = new Set(activeTicketOperationIdsRef.current);
    next.delete(ticketId);
    activeTicketOperationIdsRef.current = next;
    setActiveTicketOperationIds(next);
  }, []);

  const setStatusWorkflowError = useCallback((ticketId: string, message: string) => {
    setStatusWorkflowDialog((current) =>
      current && current.ticketId === ticketId
        ? { ...current, errorMessage: message }
        : current,
    );
  }, []);

  const syncTicketIntoState = useCallback((nextTicket: Ticket) => {
    setTickets((current) => {
      const existingTicket = current.find((ticket) => ticket.id === nextTicket.id);

      if (!existingTicket) {
        return current;
      }

      return current.map((ticket) => (ticket.id === nextTicket.id ? { ...ticket, ...nextTicket } : ticket));
    });

    setDrafts((current) => ({
      ...current,
      [nextTicket.id]: {
        assigned_to: nextTicket.assigned_to ?? "",
        notes: nextTicket.notes ?? "",
      },
    }));
  }, []);

  const syncTicketIntoOrdersState = useCallback((nextTicket: Ticket) => {
    setOrders((current) => {
      const nextIsTrackedOrder = isTrackedOrderRecord(nextTicket);
      const allowedStatuses = new Set(getOrdersFilterStatuses(ordersFilter));
      const matchesCurrentOrdersFilter =
        nextTicket.status === "ORDERED" ||
        nextTicket.status === "READY" ||
        nextTicket.status === "COMPLETED"
          ? allowedStatuses.has(nextTicket.status)
          : false;
      const existingIndex = current.findIndex((ticket) => ticket.id === nextTicket.id);

      if ((!nextIsTrackedOrder || !matchesCurrentOrdersFilter) && existingIndex === -1) {
        return current;
      }

      if ((!nextIsTrackedOrder || !matchesCurrentOrdersFilter) && existingIndex >= 0) {
        return current.filter((ticket) => ticket.id !== nextTicket.id);
      }

      if (existingIndex === -1) {
        return [nextTicket, ...current].sort((left, right) => {
          const leftTime = new Date(left.ordered_at ?? left.updated_at ?? left.created_at ?? 0).getTime();
          const rightTime = new Date(right.ordered_at ?? right.updated_at ?? right.created_at ?? 0).getTime();
          return rightTime - leftTime;
        });
      }

      return current.map((ticket) => (ticket.id === nextTicket.id ? { ...ticket, ...nextTicket } : ticket));
    });
  }, [ordersFilter]);

  const toOrderedWorkflowErrorMessage = useCallback((error: unknown, fallbackMessage: string) => {
    const baseMessage = sanitizeUserFacingError(error, fallbackMessage);
    const normalized = baseMessage.toLowerCase();

    if (
      normalized.includes("expected_delivery_date") ||
      normalized.includes("lead_time_note") ||
      normalized.includes("ordered_at") ||
      normalized.includes("ordered_by") ||
      normalized.includes("purchase_order_number") ||
      normalized.includes("supplier_name") ||
      normalized.includes("supplier_email") ||
      normalized.includes("order_amount") ||
      normalized.includes("bin_location") ||
      normalized.includes("ready_at") ||
      normalized.includes("ready_by") ||
      normalized.includes("overdue_reminder_dismissed_at") ||
      normalized.includes("overdue_reminder_dismissed_by") ||
      normalized.includes("schema cache")
    ) {
      return ORDERED_WORKFLOW_MIGRATION_HINT;
    }

    return baseMessage;
  }, []);

  const verifyAdminActionAccess = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      throw new Error("Supabase environment variables are not configured.");
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase);

    if (!user || !isAdmin) {
      throw new Error("Admin access is required for this action.");
    }

    return supabase;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "guide" || tab === "faq" || tab === "orders" || tab === "queries" || tab === "search") {
      setResourceTab(tab);
      return;
    }

    setResourceTab("operations");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !currentUserId) {
      return;
    }

    const stored = window.sessionStorage.getItem(`relay-admin-oversight-${currentUserId}`);

    if (!stored) {
      setDismissedOversightIds([]);
      return;
    }

    try {
      setDismissedOversightIds(JSON.parse(stored) as string[]);
    } catch {
      setDismissedOversightIds([]);
      window.sessionStorage.removeItem(`relay-admin-oversight-${currentUserId}`);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (resourceTab !== "operations") {
      return;
    }

    setOversightNow(Date.now());
    const intervalId = window.setInterval(() => {
      setOversightNow(Date.now());
    }, OVERSIGHT_TIMER_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [resourceTab]);

  const loadOrders = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) {
      setIsOrdersLoading(true);
    }

    setOrdersErrorMessage("");
    setOrdersNotice(null);

    try {
      const supabase = await verifyAdminActionAccess();
      const statuses = getOrdersFilterStatuses(ordersFilter);
      const [ordersResult, snapshotsResult] = await Promise.all([
        supabase
          .from("tickets")
          .select("*")
          .in("status", [...statuses])
          .order("ordered_at", { ascending: false, nullsFirst: false })
          .order("updated_at", { ascending: false }),
        fetchMonthlySupplierSpendSnapshots(supabase),
      ]);

      if (ordersResult.error) {
        throw ordersResult.error;
      }

      const trackedOrders = ((ordersResult.data ?? []) as Ticket[]).filter((ticket) => isTrackedOrderRecord(ticket));
      let nextSnapshots = snapshotsResult;

      if (trackedOrders.length > 0 && nextSnapshots.length === 0 && !isBackfillingMonthlySpend) {
        setIsBackfillingMonthlySpend(true);
        try {
          nextSnapshots = await backfillMonthlySupplierSpendSnapshots(supabase);
        } finally {
          setIsBackfillingMonthlySpend(false);
        }
      }

      setOrders(trackedOrders);
      setMonthlySpendSnapshots(nextSnapshots);
      setSelectedSpendMonth((current) =>
        current && nextSnapshots.some((snapshot) => snapshot.month_start === current)
          ? current
          : nextSnapshots[0]?.month_start || "",
      );
    } catch (error) {
      setOrders([]);
      setMonthlySpendSnapshots([]);
      setOrdersErrorMessage(
        toOrderedWorkflowErrorMessage(error, "Unable to load the orders register."),
      );
    } finally {
      setIsOrdersLoading(false);
    }
  }, [isBackfillingMonthlySpend, ordersFilter, toOrderedWorkflowErrorMessage, verifyAdminActionAccess]);

  useEffect(() => {
    if (resourceTab !== "orders") {
      return;
    }

    void loadOrders();
  }, [loadOrders, ordersFilter, resourceTab]);

  const handleSmartSearch = useCallback(async () => {
    const normalizedQuery = smartSearchQuery.trim();

    if (normalizedQuery.length < 2) {
      setSmartSearchErrorMessage("Enter at least 2 characters to search.");
      setSmartSearchResults([]);
      return;
    }

    setIsSmartSearchLoading(true);
    setSmartSearchErrorMessage("");

    try {
      const accessToken = await getSupabaseAccessToken();

      if (!accessToken) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch("/api/admin/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          query: normalizedQuery,
          scope: smartSearchScope,
        }),
      });

      const payload = (await response.json()) as SmartSearchResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Smart search failed.");
      }

      setSmartSearchResults(payload.results ?? []);
    } catch (error) {
      setSmartSearchResults([]);
      setSmartSearchErrorMessage(
        error instanceof Error ? error.message : "Smart search is unavailable right now.",
      );
    } finally {
      setIsSmartSearchLoading(false);
    }
  }, [smartSearchQuery, smartSearchScope]);

  useEffect(() => {
    const storedState = window.sessionStorage.getItem(ADMIN_CHAT_READ_STORAGE_KEY);

    if (!storedState) {
      return;
    }

    try {
      setReadRequesterMessageByTicket(JSON.parse(storedState) as Record<string, string>);
    } catch {
      window.sessionStorage.removeItem(ADMIN_CHAT_READ_STORAGE_KEY);
    }
  }, []);

  const loadTickets = useCallback(async () => {
    const requestId = ++loadTicketsRequestIdRef.current;
    setIsLoading(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setTickets([]);
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, isAdmin, profile } = await getCurrentUserWithRole(supabase);

    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    setCurrentUserId(user.id);
    setCurrentUserDisplayName(
      profile?.display_name?.trim() ||
      user.email?.split("@")[0]?.trim() ||
      "Stores Operator",
    );

    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .in("status", activeTicketStatuses)
      .order("updated_at", { ascending: false });

    if (error) {
      if (requestId !== loadTicketsRequestIdRef.current) {
        return;
      }

      setTickets([]);
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to load the live parts request queue. Refresh and try again."),
      );
      setIsLoading(false);
      return;
    }

    const nextTickets = (data ?? []) as Ticket[];

    if (nextTickets.length > 0) {
      const ticketIds = nextTickets.map((ticket) => ticket.id);
      const avatarUserIds = nextTickets
        .map((ticket) => ticket.user_id)
        .filter((userId): userId is string => Boolean(userId));

      const [updatesResult, avatarsResult] = await Promise.allSettled([
        supabase
          .from("ticket_updates")
          .select("ticket_id, comment")
          .in("ticket_id", ticketIds),
        fetchProfileAvatarUrls(supabase, avatarUserIds),
      ]);

      if (requestId === loadTicketsRequestIdRef.current) {
        if (updatesResult.status === "fulfilled") {
          const returnedReasons = (updatesResult.value.data ?? []).reduce<Record<string, string>>(
            (accumulator, update) => {
              const reason = extractRequesterReturnReason(update.comment);

              if (reason && typeof update.ticket_id === "string") {
                accumulator[update.ticket_id] = reason;
              }

              return accumulator;
            },
            {},
          );

          setCollectedTicketIds(
            new Set(
              (updatesResult.value.data ?? [])
                .filter((update) => update.comment === REQUESTER_COLLECTED_COMMENT)
                .map((update) => update.ticket_id)
                .filter((ticketId): ticketId is string => typeof ticketId === "string"),
            ),
          );
          setReturnedTicketReasonById(returnedReasons);
        } else {
          setCollectedTicketIds(new Set());
          setReturnedTicketReasonById({});
        }

        if (avatarsResult.status === "fulfilled") {
          setProfileAvatarByUserId(avatarsResult.value);
        } else {
          console.error("Failed to load requester avatars", avatarsResult.reason);
          setProfileAvatarByUserId({});
        }
      }
    } else {
      setCollectedTicketIds(new Set());
      setReturnedTicketReasonById({});
      setProfileAvatarByUserId({});
    }

    if (requestId !== loadTicketsRequestIdRef.current) {
      return;
    }

    setTickets(nextTickets);
    setDrafts(
      Object.fromEntries(
        nextTickets.map((ticket) => [
          ticket.id,
          {
            assigned_to: ticket.assigned_to ?? "",
            notes: ticket.notes ?? "",
          },
        ]),
      ),
    );
    setSelectedChatTicketId((current) => {
      if (current && nextTickets.some((ticket) => ticket.id === current)) {
        return current;
      }

      return nextTickets[0]?.id ?? null;
    });
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadTickets]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const channel = supabase.channel("relay-admin-ticket-refresh");
    const syncRealtimeTicket = (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      const nextTicket = payload.new as Partial<Ticket>;
      const previousTicket = payload.old as Partial<Ticket>;
      const ticketId =
        typeof nextTicket.id === "string"
          ? nextTicket.id
          : typeof previousTicket.id === "string"
            ? previousTicket.id
            : null;

      if (!ticketId) {
        return;
      }

      if (payload.eventType === "DELETE") {
        setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
        return;
      }

      if (!nextTicket.id || typeof nextTicket.id !== "string") {
        return;
      }

      setTickets((current) => {
        const hydratedTicket = nextTicket as Ticket;
        const nextStatus = hydratedTicket.status ?? null;
        const shouldTrackTicket =
          nextStatus !== null &&
          nextStatus !== "COMPLETED" &&
          activeTicketStatuses.some((status) => status === nextStatus);

        if (!shouldTrackTicket) {
          return current.filter((ticket) => ticket.id !== hydratedTicket.id);
        }

        const existingTicket = current.find((ticket) => ticket.id === hydratedTicket.id);
        const nextTickets = existingTicket
          ? current.map((ticket) =>
              ticket.id === hydratedTicket.id
                ? { ...ticket, ...hydratedTicket }
                : ticket,
            )
          : [hydratedTicket, ...current];

        return nextTickets.sort(
          (left, right) =>
            new Date(right.updated_at ?? right.created_at ?? 0).getTime() -
            new Date(left.updated_at ?? left.created_at ?? 0).getTime(),
        );
      });

      setDrafts((current) => ({
        ...current,
        [ticketId]: {
          assigned_to:
            typeof nextTicket.assigned_to === "string"
              ? nextTicket.assigned_to
              : "",
          notes: typeof nextTicket.notes === "string" ? nextTicket.notes : "",
        },
      }));
    };
    const scheduleTicketRefresh = () => {
      if (adminTicketRefreshTimeoutRef.current) {
        window.clearTimeout(adminTicketRefreshTimeoutRef.current);
      }

      adminTicketRefreshTimeoutRef.current = window.setTimeout(() => {
        adminTicketRefreshTimeoutRef.current = null;
        void loadTickets();
      }, ADMIN_TICKET_REFRESH_DEBOUNCE_MS);
    };

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tickets",
      },
      (payload) => {
        syncRealtimeTicket(payload);
        scheduleTicketRefresh();
      },
    );

    channel.subscribe();

    return () => {
      if (adminTicketRefreshTimeoutRef.current) {
        window.clearTimeout(adminTicketRefreshTimeoutRef.current);
        adminTicketRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      if (statusFilter !== "ALL" && ticket.status !== statusFilter) {
        return false;
      }

      if (
        assignedUserFilter &&
        !(ticket.assigned_to ?? "").toLowerCase().includes(assignedUserFilter.toLowerCase())
      ) {
        return false;
      }

      if (departmentFilter !== "ALL" && ticket.department !== departmentFilter) {
        return false;
      }

      if (!matchesDateFilter(ticket.updated_at ?? ticket.created_at, dateFilter)) {
        return false;
      }

      return true;
    });
  }, [assignedUserFilter, dateFilter, departmentFilter, statusFilter, tickets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [assignedUserFilter, dateFilter, departmentFilter, statusFilter, viewMode, pageSize]);

  const totalFilteredTickets = filteredTickets.length;
  const totalTicketPages = Math.max(1, Math.ceil(totalFilteredTickets / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalTicketPages);
  const pagedFilteredTickets = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredTickets.slice(startIndex, startIndex + pageSize);
  }, [filteredTickets, pageSize, safeCurrentPage]);
  const pagedTicketRangeLabel = useMemo(() => {
    if (totalFilteredTickets === 0) {
      return "0 of 0";
    }

    const start = (safeCurrentPage - 1) * pageSize + 1;
    const end = Math.min(start + pageSize - 1, totalFilteredTickets);
    return `${start}-${end} of ${totalFilteredTickets}`;
  }, [pageSize, safeCurrentPage, totalFilteredTickets]);

  const dashboardMetrics = useMemo(() => {
    const activeTickets = tickets;
    const unassignedCount = activeTickets.filter((ticket) => !ticket.assigned_to?.trim()).length;
    const statusCounts = activeTickets.reduce<Record<string, number>>((accumulator, ticket) => {
      const status = ticket.status ?? "UNKNOWN";
      accumulator[status] = (accumulator[status] ?? 0) + 1;
      return accumulator;
    }, {});

    const operatorWorkload = Object.entries(
      activeTickets.reduce<Record<string, { total: number; pending: number; ready: number }>>(
        (accumulator, ticket) => {
          const operator = ticket.assigned_to?.trim() || "Unassigned";
          const current = accumulator[operator] ?? {
            total: 0,
            pending: 0,
            ready: 0,
          };

          current.total += 1;

          if (
            ticket.status === "PENDING" ||
            ticket.status === "ESTIMATE" ||
            ticket.status === "QUOTE" ||
            ticket.status === "QUERY"
          ) {
            current.pending += 1;
          }

          if (ticket.status === "IN_PROGRESS" || ticket.status === "ORDERED") {
            current.pending += 0;
          }

          if (ticket.status === "READY") {
            current.ready += 1;
          }

          accumulator[operator] = current;
          return accumulator;
        },
        {},
      ),
    )
      .map(([operator, metrics]) => ({ operator, ...metrics }))
      .sort((left, right) => right.total - left.total);

    const longestOpenHours = getLongestOpenHours(activeTickets);

    return {
      activeCount: activeTickets.length,
      unassignedCount,
      longestOpenHours,
      operatorWorkload,
      statusCounts,
    };
  }, [tickets]);

  const selectedChatTicket =
    filteredTickets.find((ticket) => ticket.id === selectedChatTicketId) ??
    tickets.find((ticket) => ticket.id === selectedChatTicketId) ??
    filteredTickets[0] ??
    null;
  const ticketIdsKey = useMemo(
    () => tickets.map((ticket) => ticket.id).join("|"),
    [tickets],
  );
  const activeSelectedChatTicketId = selectedChatTicket?.id ?? null;

  const refreshRequesterMessages = useCallback(async () => {
    const requestId = ++requesterMessagesRequestIdRef.current;
    const ticketIds = ticketIdsKey ? ticketIdsKey.split("|") : [];

    if (ticketIds.length === 0) {
      setRequesterMessagesByTicket({});
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const { data, error } = await supabase
      .from("ticket_messages")
      .select(
        "id, ticket_id, sender_user_id, sender_role, message_text, attachment_url, attachment_type, is_ai_message, created_at",
      )
      .in("ticket_id", ticketIds)
      .eq("sender_role", "requester")
      .order("created_at", { ascending: false });

    if (requestId !== requesterMessagesRequestIdRef.current || error) {
      return;
    }

    const grouped = ((data ?? []) as TicketMessageRecord[]).reduce<
      Record<string, TicketMessageRecord[]>
    >((accumulator, message) => {
      accumulator[message.ticket_id] = [...(accumulator[message.ticket_id] ?? []), message];
      return accumulator;
    }, {});

    setRequesterMessagesByTicket(grouped);
  }, [ticketIdsKey]);

  useEffect(() => {
    void refreshRequesterMessages();
  }, [refreshRequesterMessages]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const ticketIds = new Set(ticketIdsKey ? ticketIdsKey.split("|").filter(Boolean) : []);

    if (ticketIds.size === 0) {
      return;
    }

    const scheduleRequesterMessageRefresh = () => {
      if (requesterMessageRefreshTimeoutRef.current) {
        window.clearTimeout(requesterMessageRefreshTimeoutRef.current);
      }

      requesterMessageRefreshTimeoutRef.current = window.setTimeout(() => {
        requesterMessageRefreshTimeoutRef.current = null;
        void refreshRequesterMessages();
      }, ADMIN_TICKET_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase.channel("relay-admin-requester-messages");
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ticket_messages",
      },
      (payload) => {
        const nextRecord =
          payload.new && typeof payload.new === "object"
            ? (payload.new as Record<string, unknown>)
            : null;
        const previousRecord =
          payload.old && typeof payload.old === "object"
            ? (payload.old as Record<string, unknown>)
            : null;
        const senderRole =
          (nextRecord?.sender_role as string | undefined) ??
          (previousRecord?.sender_role as string | undefined);
        const ticketId =
          (nextRecord?.ticket_id as string | undefined) ??
          (previousRecord?.ticket_id as string | undefined);

        if (senderRole !== "requester" || !ticketId || !ticketIds.has(ticketId)) {
          return;
        }

        scheduleRequesterMessageRefresh();
      },
    );

    channel.subscribe();

    return () => {
      if (requesterMessageRefreshTimeoutRef.current) {
        window.clearTimeout(requesterMessageRefreshTimeoutRef.current);
        requesterMessageRefreshTimeoutRef.current = null;
      }

      void supabase.removeChannel(channel);
    };
  }, [refreshRequesterMessages, ticketIdsKey]);

  useEffect(() => {
    if (isChatCollapsed || !activeSelectedChatTicketId) {
      return;
    }

    const latestRequesterMessage =
      getLatestRequesterMessage(activeSelectedChatTicketId)?.created_at;

    if (!latestRequesterMessage) {
      return;
    }

    setReadRequesterMessageByTicket((current) => {
      if (current[activeSelectedChatTicketId] === latestRequesterMessage) {
        return current;
      }

      const nextState = {
        ...current,
        [activeSelectedChatTicketId]: latestRequesterMessage,
      };

      window.sessionStorage.setItem(
        ADMIN_CHAT_READ_STORAGE_KEY,
        JSON.stringify(nextState),
      );

      return nextState;
    });
  }, [activeSelectedChatTicketId, getLatestRequesterMessage, isChatCollapsed]);

  useEffect(() => {
    async function loadTicketMessages() {
      const requestId = ++chatLoadRequestIdRef.current;
      if (!activeSelectedChatTicketId) {
        setChatAttachments([]);
        setChatMessages([]);
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        if (requestId === chatLoadRequestIdRef.current) {
          setErrorMessage("Supabase environment variables are not configured.");
        }
        return;
      }

      setIsChatLoading(true);

      try {
        const [attachments, messages] = await Promise.all([
          fetchTicketAttachments(supabase, activeSelectedChatTicketId),
          fetchTicketMessages(supabase, activeSelectedChatTicketId),
        ]);
        const senderNames = await fetchProfileDisplayNamesByUserId(
          supabase,
          messages
            .map((message) => message.sender_user_id)
            .filter((userId): userId is string => Boolean(userId)),
        );

        if (requestId === chatLoadRequestIdRef.current) {
          setChatAttachments(attachments);
          setChatMessages(messages);
          setChatSenderNameByUserId(senderNames);
        }
      } catch (chatError) {
        if (requestId === chatLoadRequestIdRef.current) {
          setErrorMessage(
            chatError instanceof Error
              ? chatError.message
              : "Failed to load ticket chat.",
          );
        }
      } finally {
        if (requestId === chatLoadRequestIdRef.current) {
          setIsChatLoading(false);
        }
      }
    }

    loadTicketMessages();
  }, [activeSelectedChatTicketId]);

  const overdueOrderedTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => isTicketOrderOverdue(ticket) && !ticket.overdue_reminder_dismissed_at,
      ),
    [tickets],
  );
  const filteredTicketsByStatus = useMemo(
    () =>
      activeTicketStatuses.reduce<Record<TicketStatus, Ticket[]>>((accumulator, status) => {
        accumulator[status] = pagedFilteredTickets.filter((ticket) => ticket.status === status);
        return accumulator;
      }, {} as Record<TicketStatus, Ticket[]>),
    [pagedFilteredTickets],
  );
  const readyOrders = useMemo(
    () => orders.filter((ticket) => ticket.status === "READY"),
    [orders],
  );
  const selectedMonthSnapshots = useMemo(
    () =>
      monthlySpendSnapshots.filter((snapshot) => snapshot.month_start === selectedSpendMonth),
    [monthlySpendSnapshots, selectedSpendMonth],
  );
  const exportMonthlySpendCsv = useCallback(() => {
    if (selectedMonthSnapshots.length === 0 || !selectedSpendMonth) {
      setOrdersNotice({
        type: "error",
        message: "There is no monthly supplier spend report to export for the selected month.",
      });
      return;
    }

    const csvRows = [
      ["month_start", "supplier_name", "order_count", "total_spend", "generated_at"],
      ...selectedMonthSnapshots.map((snapshot) => [
        snapshot.month_start,
        snapshot.supplier_name,
        String(snapshot.order_count),
        String(snapshot.total_spend),
        snapshot.generated_at,
      ]),
    ];
    const csvContent = csvRows
      .map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `relay-supplier-spend-${selectedSpendMonth}.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);

    setOrdersNotice({
      type: "success",
      message: `Exported supplier spend report for ${selectedSpendMonth}.`,
    });
  }, [selectedMonthSnapshots, selectedSpendMonth]);

  const exportReadyOrdersCsv = useCallback(() => {
    if (readyOrders.length === 0) {
      setOrdersNotice({
        type: "error",
        message: "There are no ready orders to export.",
      });
      return;
    }

    const csvContent = buildOrdersCsvContent(readyOrders);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `relay-ready-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);

    setOrdersNotice({
      type: "success",
      message: `Exported ${readyOrders.length} ready order${readyOrders.length === 1 ? "" : "s"}.`,
    });
  }, [readyOrders]);

  const emailReadyOrders = useCallback(() => {
    if (readyOrders.length === 0) {
      setOrdersNotice({
        type: "error",
        message: "There are no ready orders to email.",
      });
      return;
    }

    window.location.href = buildReadyOrdersMailto(readyOrders);
    setOrdersNotice({
      type: "success",
      message: "Prepared ready orders email in your mail client.",
    });
  }, [readyOrders]);

  const openStatusWorkflowDialog = useCallback((ticket: Ticket, nextStatus: TicketStatus) => {
    const mode = getStatusWorkflowRequirement(ticket.status, nextStatus);

    if (!mode) {
      return false;
    }

    setStatusWorkflowDialog({
      ticketId: ticket.id,
      mode,
      nextStatus,
      expectedDeliveryDate: toDateInputValue(ticket.expected_delivery_date),
      leadTimeNote: ticket.lead_time_note ?? "",
      purchaseOrderNumber: ticket.purchase_order_number ?? "",
      supplierName: ticket.supplier_name ?? "",
      supplierEmail: ticket.supplier_email ?? "",
      orderAmount:
        typeof ticket.order_amount === "number" && !Number.isNaN(ticket.order_amount)
          ? String(ticket.order_amount)
          : "",
      binLocation: ticket.bin_location ?? "",
      errorMessage: "",
    });

    return true;
  }, []);

  const dismissOverdueReminder = useCallback(async (ticketId: string) => {
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);

    if (!currentTicket || dismissingOverdueTicketId === ticketId) {
      return;
    }

    let supabase: ReturnType<typeof getSupabaseClient>;

    try {
      supabase = await verifyAdminActionAccess();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Admin access is required for this action."),
      );
      return;
    }

    const dismissedAt = new Date().toISOString();
    const dismissedBy = currentUserDisplayName || currentUserId || "Administrator";

    setDismissingOverdueTicketId(ticketId);

    const { error } = await supabase
      .from("tickets")
      .update({
        overdue_reminder_dismissed_at: dismissedAt,
        overdue_reminder_dismissed_by: dismissedBy,
        updated_at: currentTicket.updated_at ?? dismissedAt,
      })
      .eq("id", ticketId);

    if (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Unable to dismiss the overdue reminder."),
      );
      setDismissingOverdueTicketId(null);
      return;
    }

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              overdue_reminder_dismissed_at: dismissedAt,
              overdue_reminder_dismissed_by: dismissedBy,
            }
          : ticket,
      ),
    );
    setOrders((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              overdue_reminder_dismissed_at: dismissedAt,
              overdue_reminder_dismissed_by: dismissedBy,
            }
          : ticket,
      ),
    );
    setDismissingOverdueTicketId(null);
  }, [currentUserDisplayName, currentUserId, dismissingOverdueTicketId, tickets, verifyAdminActionAccess]);

  const commitStatusChange = useCallback(async (
    ticketId: string,
    nextStatus: TicketStatus,
    workflow?: {
      expectedDeliveryDate?: string;
      leadTimeNote?: string;
      purchaseOrderNumber?: string;
      supplierName?: string;
      supplierEmail?: string;
      orderAmount?: string;
      binLocation?: string;
    },
  ): Promise<Ticket | null> => {
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);
    const draft = drafts[ticketId];

    if (!currentTicket || currentTicket.status === nextStatus || activeTicketOperationIds.has(ticketId)) {
      return null;
    }

    const nextAssignedTo = draft?.assigned_to.trim() ?? currentTicket.assigned_to?.trim() ?? "";
    const nextNotes = draft?.notes.trim() ?? currentTicket.notes?.trim() ?? "";
    const currentNotes = currentTicket.notes?.trim() ?? "";
    const notesChanged = nextNotes !== currentNotes;
    const actorName = currentUserDisplayName || currentUserId || "Stores Operator";
    const nextUpdatedAt = new Date().toISOString();
    const wasOrdered = currentTicket.status === "ORDERED";
    const movingOrderedToReady = wasOrdered && nextStatus === "READY";
    const leavingOrdered = wasOrdered && nextStatus !== "ORDERED";
    const normalizedExpectedDeliveryDate = workflow?.expectedDeliveryDate?.trim() || "";
    const normalizedLeadTimeNote = workflow?.leadTimeNote?.trim() || "";
    const normalizedPurchaseOrderNumber = workflow?.purchaseOrderNumber?.trim() || "";
    const normalizedSupplierName = workflow?.supplierName?.trim()
      ? formatSupplierDisplayName(workflow.supplierName)
      : "";
    const normalizedSupplierEmail = workflow?.supplierEmail?.trim()
      ? normalizeSupplierEmail(workflow.supplierEmail)
      : "";
    const normalizedOrderAmountInput = workflow?.orderAmount?.trim() || "";
    const parsedOrderAmount = parseOrderAmountInput(normalizedOrderAmountInput);
    const normalizedBinLocation = workflow?.binLocation?.trim() || "";

    if (nextStatus === "ORDERED") {
      if (!normalizedExpectedDeliveryDate) {
        setStatusWorkflowError(ticketId, "Expected delivery date is required before saving ORDERED.");
        return null;
      }

      if (!parseDueDateToEndOfDay(normalizedExpectedDeliveryDate)) {
        setStatusWorkflowError(ticketId, "Enter a valid expected delivery date before saving ORDERED.");
        return null;
      }

      if (!normalizedPurchaseOrderNumber) {
        setStatusWorkflowError(ticketId, "PO number is required before saving ORDERED.");
        return null;
      }

      if (!normalizedSupplierName) {
        setStatusWorkflowError(ticketId, "Supplier is required before saving ORDERED.");
        return null;
      }

      if (!normalizedOrderAmountInput) {
        setStatusWorkflowError(ticketId, "Order amount is required before saving ORDERED.");
        return null;
      }

      if (parsedOrderAmount == null || Number.isNaN(parsedOrderAmount)) {
        setStatusWorkflowError(ticketId, "Enter a valid non-negative order amount before saving ORDERED.");
        return null;
      }
    }

    if (movingOrderedToReady && !normalizedBinLocation) {
      setStatusWorkflowError(ticketId, "Bin location required before marking this ticket READY.");
      return null;
    }

    if (!beginTicketOperation(ticketId)) {
      return null;
    }

    setUpdatingTicketId(ticketId);
    setErrorMessage("");

    let supabase: ReturnType<typeof getSupabaseClient>;

    try {
      supabase = await verifyAdminActionAccess();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Admin access is required for this action."),
      );
      setUpdatingTicketId(null);
      finishTicketOperation(ticketId);
      return null;
    }

    const updatePayload: Record<string, string | null> = {
      status: nextStatus,
      assigned_to: nextAssignedTo || null,
      notes: nextNotes || null,
      updated_at: nextUpdatedAt,
    };

    if (nextStatus === "ORDERED") {
      updatePayload.expected_delivery_date = normalizedExpectedDeliveryDate || null;
      updatePayload.lead_time_note = normalizedLeadTimeNote || null;
      updatePayload.ordered_at = nextUpdatedAt;
      updatePayload.ordered_by = actorName;
      updatePayload.purchase_order_number = normalizedPurchaseOrderNumber || null;
      updatePayload.supplier_name = normalizedSupplierName || null;
      updatePayload.supplier_email = normalizedSupplierEmail || null;
      updatePayload.order_amount =
        parsedOrderAmount != null && !Number.isNaN(parsedOrderAmount)
          ? String(parsedOrderAmount)
          : null;
      updatePayload.overdue_reminder_dismissed_at = null;
      updatePayload.overdue_reminder_dismissed_by = null;
    } else if (movingOrderedToReady) {
      updatePayload.bin_location = normalizedBinLocation || null;
      updatePayload.ready_at = nextUpdatedAt;
      updatePayload.ready_by = actorName;
      updatePayload.overdue_reminder_dismissed_at = null;
      updatePayload.overdue_reminder_dismissed_by = null;
    } else if (leavingOrdered) {
      updatePayload.overdue_reminder_dismissed_at = null;
      updatePayload.overdue_reminder_dismissed_by = null;
    }

    let updateQuery = supabase
      .from("tickets")
      .update(updatePayload)
      .eq("id", ticketId);

    if (currentTicket.updated_at) {
      updateQuery = updateQuery.eq("updated_at", currentTicket.updated_at);
    }

    const { data: updatedTicket, error: updateError } = await updateQuery
      .select("*")
      .maybeSingle();

    if (updateError) {
      const message = toOrderedWorkflowErrorMessage(updateError, "Unable to update ticket status.");
      setErrorMessage(message);
      setStatusWorkflowError(ticketId, message);
      setUpdatingTicketId(null);
      finishTicketOperation(ticketId);
      return null;
    }

    if (!updatedTicket) {
      const message = "This ticket changed in another session. Refresh and try again.";
      setErrorMessage(message);
      setStatusWorkflowError(ticketId, message);
      setUpdatingTicketId(null);
      finishTicketOperation(ticketId);
      void loadTickets();
      return null;
    }

    const ticketUpdateRows: Array<{ ticket_id: string; status?: string; comment?: string }> = [
      { ticket_id: ticketId, status: nextStatus },
    ];

    if (nextStatus === "ORDERED" && normalizedExpectedDeliveryDate) {
      ticketUpdateRows.push({
        ticket_id: ticketId,
        comment: buildOrderedWorkflowComment({
          expectedDeliveryDate: normalizedExpectedDeliveryDate,
          leadTimeNote: normalizedLeadTimeNote,
          purchaseOrderNumber: normalizedPurchaseOrderNumber,
          supplierName: normalizedSupplierName,
          supplierEmail: normalizedSupplierEmail,
          orderAmount:
            parsedOrderAmount != null && !Number.isNaN(parsedOrderAmount)
              ? parsedOrderAmount
              : null,
          actorName,
        }),
      });
    }

    if (movingOrderedToReady && normalizedBinLocation) {
      ticketUpdateRows.push({
        ticket_id: ticketId,
        comment: buildReadyWorkflowComment({
          binLocation: normalizedBinLocation,
          actorName,
        }),
      });
    }

    if (notesChanged && nextNotes) {
      ticketUpdateRows.push({
        ticket_id: ticketId,
        comment: nextNotes,
      });
    }

    const { error: insertError } = await supabase
      .from("ticket_updates")
      .insert(ticketUpdateRows);

    if (insertError) {
      const message = sanitizeUserFacingError(insertError, "Unable to record the ticket update.");
      setErrorMessage(message);
      setStatusWorkflowError(ticketId, message);
      setUpdatingTicketId(null);
      finishTicketOperation(ticketId);
      return null;
    }

    if (nextStatus === "COMPLETED") {
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId));
    } else {
      syncTicketIntoState(updatedTicket as Ticket);
    }
    syncTicketIntoOrdersState(updatedTicket as Ticket);
    const updatedOrderMonth = (updatedTicket as Ticket).ordered_at?.slice(0, 7);
    if (updatedOrderMonth) {
      void syncMonthlySupplierSpendSnapshotsForMonth(
        supabase,
        `${updatedOrderMonth}-01`,
      )
        .then(() => fetchMonthlySupplierSpendSnapshots(supabase))
        .then((snapshots) => {
          setMonthlySpendSnapshots(snapshots);
          setSelectedSpendMonth((current) => current || snapshots[0]?.month_start || "");
        })
        .catch((snapshotError) => {
          console.error("Failed to refresh monthly supplier spend snapshots", snapshotError);
        });
    }
    if (selectedChatTicketId === ticketId && nextStatus === "COMPLETED") {
      setSelectedChatTicketId(null);
    }
    setUpdatingTicketId(null);
    finishTicketOperation(ticketId);
    void notifyRequesterStatusChanged(supabase, {
      userId: currentTicket.user_id,
      ticketId,
      jobNumber: currentTicket.job_number,
      nextStatus,
      requestSummary: currentTicket.request_summary ?? currentTicket.request_details,
      assignedTo: nextAssignedTo || currentTicket.assigned_to,
      binLocation:
        movingOrderedToReady
          ? normalizedBinLocation || null
          : (updatedTicket as Ticket).bin_location ?? currentTicket.bin_location ?? null,
    }).catch((notificationError) => {
      console.error("Failed to notify requester about status change", notificationError);
    });

    if (nextStatus === "COMPLETED") {
      void deleteTicketAttachmentsForTicket(supabase, ticketId).catch((attachmentError) => {
        console.error("Failed to delete completed ticket attachments", attachmentError);
      });
    }

    return updatedTicket as Ticket;
  }, [
    activeTicketOperationIds,
    beginTicketOperation,
    currentUserDisplayName,
    currentUserId,
    drafts,
    finishTicketOperation,
    loadTickets,
    syncTicketIntoOrdersState,
    selectedChatTicketId,
    setStatusWorkflowError,
    syncTicketIntoState,
    tickets,
    toOrderedWorkflowErrorMessage,
    verifyAdminActionAccess,
  ]);

  const handleStatusChange = useCallback(async (ticketId: string, nextStatus: TicketStatus) => {
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);

    if (!currentTicket || currentTicket.status === nextStatus || activeTicketOperationIds.has(ticketId)) {
      return;
    }

    if (openStatusWorkflowDialog(currentTicket, nextStatus)) {
      return;
    }

    await commitStatusChange(ticketId, nextStatus);
  }, [activeTicketOperationIds, commitStatusChange, openStatusWorkflowDialog, tickets]);

  const handleTicketSave = useCallback(async (ticketId: string) => {
    const draft = drafts[ticketId];
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);

    if (activeTicketOperationIds.has(ticketId)) {
      return;
    }

    if (!draft || !currentTicket) {
      setErrorMessage("Unable to load the latest ticket changes.");
      return;
    }

    const nextAssignedTo = draft.assigned_to.trim();
    const nextNotes = draft.notes.trim();
    const currentAssignedTo = currentTicket.assigned_to?.trim() ?? "";
    const currentNotes = currentTicket.notes?.trim() ?? "";
    const assignmentChanged = nextAssignedTo !== currentAssignedTo;
    const notesChanged = nextNotes !== currentNotes;

    if (!assignmentChanged && !notesChanged) {
      setUpdatingTicketId(null);
      return;
    }

    if (!beginTicketOperation(ticketId)) {
      return;
    }

    let supabase: ReturnType<typeof getSupabaseClient>;

    try {
      supabase = await verifyAdminActionAccess();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingError(error, "Admin access is required for this action."),
      );
      finishTicketOperation(ticketId);
      return;
    }

    setUpdatingTicketId(ticketId);
    setErrorMessage("");

    const nextUpdatedAt = new Date().toISOString();
    let updateQuery = supabase
      .from("tickets")
      .update({
        assigned_to: nextAssignedTo || null,
        notes: nextNotes || null,
        updated_at: nextUpdatedAt,
      })
      .eq("id", ticketId);

    if (currentTicket.updated_at) {
      updateQuery = updateQuery.eq("updated_at", currentTicket.updated_at);
    }

    const { data: updatedTicket, error: updateError } = await updateQuery
      .select("id, updated_at")
      .maybeSingle();

    if (updateError) {
      setErrorMessage(
        sanitizeUserFacingError(updateError, "Unable to save ticket changes."),
      );
      setUpdatingTicketId(null);
      finishTicketOperation(ticketId);
      return;
    }

    if (!updatedTicket) {
      setErrorMessage("This ticket changed in another session. Refresh and try again.");
      setUpdatingTicketId(null);
      finishTicketOperation(ticketId);
      void loadTickets();
      return;
    }

    if (notesChanged && nextNotes) {
      const { error: insertError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticketId,
        comment: nextNotes,
      });

      if (insertError) {
        setErrorMessage(
          sanitizeUserFacingError(insertError, "Unable to save the ticket note."),
        );
        setUpdatingTicketId(null);
        finishTicketOperation(ticketId);
        return;
      }
    }

    setTickets((current) =>
      current.map((ticket) =>
            ticket.id === ticketId
          ? {
              ...ticket,
              assigned_to: nextAssignedTo || null,
              notes: nextNotes || null,
              updated_at: updatedTicket.updated_at ?? nextUpdatedAt,
            }
          : ticket,
      ),
    );
    setUpdatingTicketId(null);
    finishTicketOperation(ticketId);
  }, [
    activeTicketOperationIds,
    beginTicketOperation,
    drafts,
    finishTicketOperation,
    loadTickets,
    tickets,
    verifyAdminActionAccess,
  ]);

  async function reloadSelectedChatMessages(
    supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
    activeTicketId: string,
  ) {
    const [attachments, messages] = await Promise.all([
      fetchTicketAttachments(supabase, activeTicketId),
      fetchTicketMessages(supabase, activeTicketId),
    ]);
    const senderNames = await fetchProfileDisplayNamesByUserId(
      supabase,
      messages
        .map((message) => message.sender_user_id)
        .filter((userId): userId is string => Boolean(userId)),
    );
    setChatAttachments(attachments);
    setChatMessages(messages);
    setChatSenderNameByUserId(senderNames);
  }

  const markTicketChatRead = useCallback((ticketId: string) => {
    const latestRequesterMessage = getLatestRequesterMessage(ticketId)?.created_at;

    if (!latestRequesterMessage) {
      return;
    }

    setReadRequesterMessageByTicket((current) => {
      const nextState = {
        ...current,
        [ticketId]: latestRequesterMessage,
      };

      window.sessionStorage.setItem(
        ADMIN_CHAT_READ_STORAGE_KEY,
        JSON.stringify(nextState),
      );

      return nextState;
    });
  }, [getLatestRequesterMessage]);

  const dismissOversightItem = useCallback((itemId: string) => {
    if (itemId.startsWith(`${REQUESTER_MESSAGE_OVERSIGHT_PREFIX}::`)) {
      const [, ticketId] = itemId.split("::");

      if (ticketId) {
        markTicketChatRead(ticketId);
      }

      return;
    }

    setDismissedOversightIds((current) => {
      if (current.includes(itemId)) {
        return current;
      }

      const next = [...current, itemId];

      if (typeof window !== "undefined" && currentUserId) {
        window.sessionStorage.setItem(`relay-admin-oversight-${currentUserId}`, JSON.stringify(next));
      }

      return next;
    });
  }, [currentUserId, markTicketChatRead]);

  const openRequesterChatFromInbox = useCallback((ticketId: string) => {
    setSelectedChatTicketId(ticketId);
    setResourceTab("operations");
    setIsChatCollapsed(false);
    markTicketChatRead(ticketId);
  }, [markTicketChatRead]);

  const unreadRequesterCountsByTicket = useMemo(
    () =>
      Object.fromEntries(
        tickets.map((ticket) => {
          const requesterMessages = requesterMessagesByTicket[ticket.id] ?? [];
          const lastReadAt = readRequesterMessageByTicket[ticket.id];

          if (!lastReadAt) {
            return [ticket.id, requesterMessages.length];
          }

          const lastReadTime = new Date(lastReadAt).getTime();
          const unreadCount = requesterMessages.filter((message) => {
            if (!message.created_at) {
              return false;
            }

            return new Date(message.created_at).getTime() > lastReadTime;
          }).length;

          return [ticket.id, unreadCount];
        }),
      ) as Record<string, number>,
    [tickets, requesterMessagesByTicket, readRequesterMessageByTicket],
  );

  const chatTickets = useMemo(() => {
    return [...filteredTickets].sort((left, right) => {
      const unreadDifference =
        (unreadRequesterCountsByTicket[right.id] ?? 0) -
        (unreadRequesterCountsByTicket[left.id] ?? 0);

      if (unreadDifference !== 0) {
        return unreadDifference;
      }

      return (
        new Date(right.updated_at ?? 0).getTime() -
        new Date(left.updated_at ?? 0).getTime()
      );
    });
  }, [filteredTickets, unreadRequesterCountsByTicket]);

  const requesterInboxItems = useMemo<
    Array<AdminOversightItem & { createdAt: string | null }>
  >(
    () =>
        tickets
        .flatMap((ticket) => {
          const latestRequesterMessage = getLatestRequesterMessage(ticket.id);
          const unreadCount = unreadRequesterCountsByTicket[ticket.id] ?? 0;

          if (!latestRequesterMessage || unreadCount <= 0) {
            return [];
          }

          const ticketLabel = ticket.job_number?.trim()
            ? `Job ${ticket.job_number.trim()}`
            : ticket.machine_reference?.trim()
              ? ticket.machine_reference.trim()
              : "Ticket";
          const requesterLabel = ticket.requester_name?.trim() || "Requester";
          const messageSummary = latestRequesterMessage.message_text?.trim()
            ? `"${clampOversightMessage(latestRequesterMessage.message_text, 120)}"`
            : "Sent an attachment.";

          return [
            {
              id: `${REQUESTER_MESSAGE_OVERSIGHT_PREFIX}::${ticket.id}::${latestRequesterMessage.id}`,
              title: `${ticketLabel}: ${requesterLabel}`,
              body:
                unreadCount > 1
                  ? `${messageSummary} ${unreadCount} unread messages.`
                  : messageSummary,
              actionLabel: "Open Chat",
              onAction: () => openRequesterChatFromInbox(ticket.id),
              createdAt: latestRequesterMessage.created_at ?? null,
            },
          ];
        })
        .sort(
          (left, right) =>
            new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
        ),
    [getLatestRequesterMessage, openRequesterChatFromInbox, tickets, unreadRequesterCountsByTicket],
  );

  const oversightItems = useMemo<AdminOversightItem[]>(() => {
    const isOlderThanOversightDelay = (ticket: Ticket) => {
      const createdTime = ticket.created_at ? new Date(ticket.created_at).getTime() : 0;

      if (!Number.isFinite(createdTime) || createdTime <= 0) {
        return false;
      }

      return oversightNow - createdTime >= OVERSIGHT_PENDING_DELAY_MS;
    };
    const pendingTickets = tickets
      .filter((ticket) => ticket.status === "PENDING")
      .sort(
        (left, right) =>
          new Date(right.created_at ?? 0).getTime() -
          new Date(left.created_at ?? 0).getTime(),
      );
    const unassignedTickets = tickets.filter(
      (ticket) =>
        ticket.status !== "COMPLETED" &&
        !ticket.assigned_to?.trim() &&
        isOlderThanOversightDelay(ticket),
    );
    const collectedReadyTickets = tickets.filter(
      (ticket) => ticket.status === "READY" && collectedTicketIds.has(ticket.id),
    );
    const formatOversightTicketLabel = (ticket: Ticket) =>
      ticket.job_number?.trim()
        ? `Job ${ticket.job_number.trim()}`
        : ticket.machine_reference?.trim()
          ? ticket.machine_reference.trim()
          : "ticket";
    const firstPendingTicket = pendingTickets[0];
    const firstUnassignedTicket = unassignedTickets[0];
    const firstCollectedReadyTicket = collectedReadyTickets[0];

    const nextItems: Array<AdminOversightItem | null> = [
      ...requesterInboxItems,
      pendingTickets.length > 0
        ? {
            id: `pending-${firstPendingTicket!.id}`,
            title: `${pendingTickets.length} job${pendingTickets.length === 1 ? "" : "s"} waiting in PENDING`,
            body: `Review ${formatOversightTicketLabel(firstPendingTicket!)} and move it into active ownership.`,
            href: `/tickets/${firstPendingTicket!.id}`,
            actionLabel: `Open ${formatOversightTicketLabel(firstPendingTicket!)}`,
          }
        : null,
      unassignedTickets.length > 0
        ? {
            id: `unassigned-${firstUnassignedTicket!.id}`,
            title: `${unassignedTickets.length} active job${unassignedTickets.length === 1 ? "" : "s"} unassigned`,
            body: `Assign ${formatOversightTicketLabel(firstUnassignedTicket!)} to stop requests sitting without an operator.`,
            href: `/tickets/${firstUnassignedTicket!.id}`,
            actionLabel: `Open ${formatOversightTicketLabel(firstUnassignedTicket!)}`,
          }
        : null,
      collectedReadyTickets.length > 0
        ? {
            id: `collected-ready-${firstCollectedReadyTicket!.id}`,
            title: `${collectedReadyTickets.length} READY job${collectedReadyTickets.length === 1 ? "" : "s"} already collected`,
            body: `Collected parts are still sitting in READY. Review ${formatOversightTicketLabel(firstCollectedReadyTicket!)} and complete it if appropriate.`,
            href: `/tickets/${firstCollectedReadyTicket!.id}`,
            actionLabel: `Open ${formatOversightTicketLabel(firstCollectedReadyTicket!)}`,
          }
        : null,
    ];

    return nextItems
      .filter((item): item is AdminOversightItem => Boolean(item))
      .filter((item) => !dismissedOversightIds.includes(item.id));
  }, [collectedTicketIds, dismissedOversightIds, oversightNow, requesterInboxItems, tickets]);

  const totalUnreadChatCount = useMemo(
    () => Object.values(unreadRequesterCountsByTicket).reduce((sum, count) => sum + count, 0),
    [unreadRequesterCountsByTicket],
  );
  const pendingRequestBannerItem = useMemo(
    () => oversightItems.find((item) => item.id.startsWith("pending-")) ?? null,
    [oversightItems],
  );

  async function handleSendChatMessage(payload: { messageText: string; files: File[] }) {
    if (!selectedChatTicket) {
      return false;
    }

    let supabase: ReturnType<typeof getSupabaseClient>;

    try {
      supabase = await verifyAdminActionAccess();
    } catch (error) {
      const message = sanitizeUserFacingError(
        error,
        "Admin access is required for this action.",
      );
      setErrorMessage(message);
      setChatNotice({
        type: "error",
        message,
      });
      return false;
    }

    setIsChatSending(true);
    setErrorMessage("");
    setChatNotice(null);

    try {
      const attachments =
        payload.files.length > 0
          ? await uploadTicketAttachments({
              supabase,
              ticketId: selectedChatTicket.id,
              userId: currentUserId,
              files: payload.files,
              attachmentKind: "chat",
            })
          : [];

      const createdMessages = await createTicketMessage({
        supabase,
        ticketId: selectedChatTicket.id,
        senderUserId: currentUserId,
        senderRole: "operator",
        messageText: payload.messageText,
        attachments,
      });

      setChatMessages((current) => [...current, ...createdMessages]);
      setChatNotice({
        type: "success",
        message: "Reply sent successfully.",
      });
      triggerActionFeedback();
      void notifyRequesterOfOperatorMessage(supabase, {
        userId: selectedChatTicket.user_id,
        ticketId: selectedChatTicket.id,
        jobNumber: selectedChatTicket.job_number,
        assignedTo: selectedChatTicket.assigned_to,
        messageText: payload.messageText,
      }).catch((notificationError) => {
        console.error("Failed to notify requester about operator reply", notificationError);
      });
      void reloadSelectedChatMessages(supabase, selectedChatTicket.id).catch((chatReloadError) => {
        console.error("Failed to reload admin chat after reply", chatReloadError);
      });
      return true;
    } catch (chatError) {
      console.error("Admin ticket chat send failed", chatError);
      const message = sanitizeUserFacingError(
        chatError,
        "Failed to send chat reply.",
      );
      setErrorMessage(message);
      setChatNotice({
        type: "error",
        message,
      });
      return false;
    } finally {
      setIsChatSending(false);
    }
  }

  async function handleAskAi(question: string) {
    if (!selectedChatTicket) {
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
        ticketId: selectedChatTicket.id,
        status: selectedChatTicket.status ?? "PENDING",
        assignedTo: selectedChatTicket.assigned_to,
        latestUpdate:
          selectedChatTicket.notes || selectedChatTicket.request_summary || null,
        requesterName: selectedChatTicket.requester_name,
        department: selectedChatTicket.department,
        machineReference: selectedChatTicket.machine_reference,
        jobNumber: selectedChatTicket.job_number,
        requestSummary: selectedChatTicket.request_summary,
        requestDetails: selectedChatTicket.request_details,
        history: [],
        recentMessages: chatMessages.slice(-6).map((message) => ({
          senderRole: message.sender_role,
          messageText: message.message_text,
          createdAt: message.created_at,
        })),
      };

      const response = await fetch(`/api/tickets/${selectedChatTicket.id}/ai`, {
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

      setChatMessages((current) => [
        ...current,
        {
          id: `ai-${Date.now()}`,
          ticket_id: selectedChatTicket.id,
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

  const handleSelectChatTicket = useCallback((ticketId: string) => {
    setSelectedChatTicketId(ticketId);
    setIsChatCollapsed(false);
    markTicketChatRead(ticketId);
  }, [markTicketChatRead]);

  const handleReadAllMessages = useCallback(() => {
    const nextState = Object.fromEntries(
      Object.entries(requesterMessagesByTicket)
        .filter(([, messages]) => messages[messages.length - 1]?.created_at)
        .map(([ticketId, messages]) => [ticketId, messages[messages.length - 1]?.created_at as string]),
    );

    setReadRequesterMessageByTicket(nextState);
    window.sessionStorage.setItem(
      ADMIN_CHAT_READ_STORAGE_KEY,
      JSON.stringify(nextState),
    );
  }, [requesterMessagesByTicket]);

  return (
    <main className="aurora-shell">
      <div className="aurora-shell-inner max-w-7xl space-y-8">
        <nav className="aurora-nav">
          <RelayLogo />
          <div className="aurora-nav-links text-sm font-medium">
            <Link href="/" className="aurora-link">
              Home
            </Link>
            <Link href="/legal" className="aurora-link">
              Legal
            </Link>
            <Link href="/settings" className="aurora-link">
              Settings
            </Link>
            <Link
              href="/submit"
              className="aurora-link"
            >
              Submit Ticket
            </Link>
            <Link
              href="/admin?tab=search"
              className="aurora-link"
            >
              Smart Search
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/tasks" className="aurora-link">
              Tasks
            </Link>
            <Link href="/incidents" className="aurora-link">
              Workshop Control
            </Link>
            <Link href="/control" className="aurora-link">
              Admin Control
            </Link>
            <Link
              href="/control/operations"
              target="_blank"
              rel="noreferrer"
              className="aurora-link"
            >
              Open Ops View
            </Link>
            <Link
              href="/wallboard"
              target="_blank"
              rel="noreferrer"
              className="aurora-link"
            >
              TV Wallboard
            </Link>
            <Link
              href="/admin"
              className="aurora-link aurora-link-active"
            >
              Parts Control
              <NotificationBadge count={adminBadgeCount} />
            </Link>
            <ThemeToggleButton />
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <>
          {overdueOrderedTickets.length > 0 ? (
            <OverdueOrderedRemindersModal
              tickets={overdueOrderedTickets.map((ticket) => ({
                id: ticket.id,
                jobNumber: ticket.job_number ?? null,
                requestSummary: ticket.request_summary ?? ticket.request_details ?? null,
                expectedDeliveryDate: formatOperationalDate(ticket.expected_delivery_date),
              }))}
              dismissingTicketId={dismissingOverdueTicketId}
              onDismissTicket={(ticketId) => void dismissOverdueReminder(ticketId)}
            />
          ) : null}

          {statusWorkflowDialog ? (
            <TicketStatusWorkflowModal
              mode={statusWorkflowDialog.mode}
              isSubmitting={updatingTicketId === statusWorkflowDialog.ticketId}
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

                if (dialog.mode === "ordered" && !dialog.expectedDeliveryDate.trim()) {
                  setStatusWorkflowDialog((current) =>
                    current
                      ? { ...current, errorMessage: "Expected delivery date is required before saving ORDERED." }
                      : current,
                  );
                  return;
                }

                if (dialog.mode === "ordered" && !dialog.purchaseOrderNumber.trim()) {
                  setStatusWorkflowDialog((current) =>
                    current
                      ? { ...current, errorMessage: "PO number is required before saving ORDERED." }
                      : current,
                  );
                  return;
                }

                if (dialog.mode === "ordered" && !dialog.supplierName.trim()) {
                  setStatusWorkflowDialog((current) =>
                    current
                      ? { ...current, errorMessage: "Supplier is required before saving ORDERED." }
                      : current,
                  );
                  return;
                }

                if (dialog.mode === "ordered" && !dialog.orderAmount.trim()) {
                  setStatusWorkflowDialog((current) =>
                    current
                      ? { ...current, errorMessage: "Order amount is required before saving ORDERED." }
                      : current,
                  );
                  return;
                }

                if (dialog.mode === "ready" && !dialog.binLocation.trim()) {
                  setStatusWorkflowDialog((current) =>
                    current
                      ? { ...current, errorMessage: "Bin location required before marking this ticket READY." }
                      : current,
                  );
                  return;
                }

                void commitStatusChange(dialog.ticketId, dialog.nextStatus, {
                  expectedDeliveryDate: dialog.expectedDeliveryDate,
                  leadTimeNote: dialog.leadTimeNote,
                  purchaseOrderNumber: dialog.purchaseOrderNumber,
                  supplierName: dialog.supplierName,
                  supplierEmail: dialog.supplierEmail,
                  orderAmount: dialog.orderAmount,
                  binLocation: dialog.binLocation,
                }).then((updatedTicket) => {
                  if (updatedTicket) {
                    setStatusWorkflowDialog(null);
                  }
                });
              }}
              onConfirmAndEmailSupplier={() => {
                const dialog = statusWorkflowDialog;

                if (!dialog) {
                  return;
                }

                void commitStatusChange(dialog.ticketId, dialog.nextStatus, {
                  expectedDeliveryDate: dialog.expectedDeliveryDate,
                  leadTimeNote: dialog.leadTimeNote,
                  purchaseOrderNumber: dialog.purchaseOrderNumber,
                  supplierName: dialog.supplierName,
                  supplierEmail: dialog.supplierEmail,
                  orderAmount: dialog.orderAmount,
                  binLocation: dialog.binLocation,
                }).then((updatedTicket) => {
                  if (!updatedTicket) {
                    return;
                  }

                  setStatusWorkflowDialog(null);
                  window.location.href = buildSupplierOrderMailto(updatedTicket);
                });
              }}
            />
          ) : null}

          {resourceTab === "operations" ? (
            <AdminOversightInbox items={oversightItems} onDismiss={dismissOversightItem} />
          ) : null}

          {resourceTab === "operations" && pendingRequestBannerItem ? (
            <PendingRequestBanner
              item={pendingRequestBannerItem}
              onDismiss={dismissOversightItem}
            />
          ) : null}

          <section className="aurora-section sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-5">
                <div className="aurora-kicker">
                  Parts Control
                </div>
              <h1 className="aurora-title text-4xl sm:text-5xl">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </h1>
                <p className="aurora-copy">
                  Monitor live request activity, manage workflow status, and control operational workload in real time.
                </p>
              </div>

              {resourceTab === "operations" ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="text-sm font-medium text-[color:var(--foreground-muted)]">
                  Filter by status
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ActiveTicketStatusFilter)
                  }
                  className="aurora-select"
                >
                  {activeTicketStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <input
                  value={assignedUserFilter}
                  onChange={(event) => setAssignedUserFilter(event.target.value)}
                  placeholder="Filter by user"
                  className="aurora-input"
                />
                <select
                  value={departmentFilter}
                  onChange={(event) =>
                    setDepartmentFilter(
                      event.target.value as "ALL" | "Onsite" | "Yard",
                    )
                  }
                  className="aurora-select"
                >
                  <option value="ALL">All Departments</option>
                  <option value="Onsite">Onsite</option>
                  <option value="Yard">Yard</option>
                </select>
                <select
                  value={dateFilter}
                  onChange={(event) =>
                    setDateFilter(
                      event.target.value as
                        | "ALL"
                        | "TODAY"
                        | "LAST_7_DAYS"
                        | "LAST_30_DAYS",
                    )
                  }
                  className="aurora-select"
                >
                  <option value="ALL">All Time</option>
                  <option value="TODAY">Today</option>
                  <option value="LAST_7_DAYS">Last 7 Days</option>
                  <option value="LAST_30_DAYS">Last 30 Days</option>
                </select>
                <select
                  value={viewMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as "table" | "compact" | "dynamic";
                    setViewMode(nextMode);
                    window.sessionStorage.setItem(
                      ADMIN_DASHBOARD_VIEW_STORAGE_KEY,
                      nextMode,
                    );
                  }}
                  className="aurora-select"
                >
                  <option value="table">Table View</option>
                  <option value="compact">Compact Summary</option>
                  <option value="dynamic">Dynamic View</option>
                </select>
                {statusFilter !== "ALL" ? (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className="aurora-button-secondary"
                  >
                    Show All
                  </button>
                ) : null}
              </div>
              ) : null}
            </div>

            <div className="mt-8">
              <PartsControlTabs activeTab={resourceTab} onTabChange={setResourceTab} />
            </div>

            {resourceTab === "guide" ? (
              <div className="mt-6">
                <AdminSupportPanel
                  title="User Guide"
                  description="Operational guidance for requesters and the internal parts team."
                  items={[
                    {
                      heading: "How to submit a request",
                      body:
                        "Use Submit Ticket, choose Onsite or Yard, add the job number, machine reference, and a clear parts summary before sending.",
                    },
                    {
                      heading: "How statuses work",
                      body:
                        "PENDING starts the queue, QUERY asks for clarification, IN_PROGRESS means Stores is actively working it, ORDERED means stock is on the way, READY means available for issue, and COMPLETED moves the job into archive.",
                    },
                    {
                      heading: "How to assign and update tickets",
                      body:
                        "Use Parts Control or Workshop Control to manage the request, add notes, and move the status through the active workflow.",
                    },
                    {
                      heading: "How chat with operator works",
                      body:
                        "Each ticket has a linked conversation thread. Requesters can message Stores with ticket context, and operators reply inside the same job-linked chat.",
                    },
                    {
                      heading: "How completed jobs archive",
                      body:
                        "Once marked COMPLETED, the request is removed from the active boards and moved to Completed Jobs for admin-only review.",
                    },
                    {
                      heading: "How parts queries work",
                      body:
                        "Use Parts Queries to log parts that came off a job, were left unfitted, or need a follow-up record even if there is no job number yet. Capture the part price, fitter, workshop response, and close it once the issue is resolved.",
                    },
                  ]}
                />
              </div>
            ) : null}

            {resourceTab === "faq" ? (
              <div className="mt-6">
                <AdminSupportPanel
                  title="FAQ"
                  description="Quick answers to common workflow questions."
                  items={[
                    {
                      heading: "Why can’t I see my request?",
                      body:
                        "Requesters only see their own active jobs. Completed jobs move to archive and stay visible on the admin side only.",
                    },
                    {
                      heading: "What does IN_PROGRESS mean?",
                      body:
                        "IN_PROGRESS means Stores or the assigned operator has received the request and is actively working it.",
                    },
                    {
                      heading: "Why is a location required for Onsite?",
                      body:
                        "Onsite requests can capture location to help Stores and operators identify where the machine or job is based before issuing parts.",
                    },
                  ]}
                />
              </div>
            ) : null}

            {resourceTab === "operations" ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Parts Control is active below. Use live workflow views, filters, chats, and queue tools to manage operational demand.
              </div>
            ) : null}

            {resourceTab === "search" ? (
              <AdminSmartSearchPanel
                query={smartSearchQuery}
                isLoading={isSmartSearchLoading}
                errorMessage={smartSearchErrorMessage}
                results={smartSearchResults}
                scope={smartSearchScope}
                onQueryChange={(value) => {
                  setSmartSearchQuery(value);
                  if (smartSearchErrorMessage) {
                    setSmartSearchErrorMessage("");
                  }
                }}
                onScopeChange={(value) => {
                  setSmartSearchScope(value);
                  if (smartSearchErrorMessage) {
                    setSmartSearchErrorMessage("");
                  }
                }}
                onSearch={() => void handleSmartSearch()}
              />
            ) : null}

            {resourceTab === "orders" ? (
              <PartsOrdersDashboard
                orders={orders}
                isLoading={isOrdersLoading}
                errorMessage={ordersErrorMessage}
                notice={ordersNotice}
                activeFilter={ordersFilter}
                monthlySpendSnapshots={monthlySpendSnapshots}
                selectedSpendMonth={selectedSpendMonth}
                isRefreshing={isOrdersLoading}
                onFilterChange={setOrdersFilter}
                onSelectedSpendMonthChange={setSelectedSpendMonth}
                onRefresh={() => void loadOrders()}
                onExportReadyCsv={exportReadyOrdersCsv}
                onEmailReadyOrders={emailReadyOrders}
                onExportMonthlySpendCsv={exportMonthlySpendCsv}
              />
            ) : null}

            {resourceTab === "queries" ? <PartsQueriesPanel /> : null}

            {resourceTab === "operations" ? (
              <>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void loadTickets()}
                disabled={isLoading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="mt-8 flex items-center justify-between gap-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                KPI Overview
              </p>
              <button
                type="button"
                onClick={() => setIsKpiMinimized((current) => !current)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                {isKpiMinimized ? "Show KPIs" : "Minimise KPIs"}
              </button>
            </div>

            {!isKpiMinimized ? (
              <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
                {activeTicketStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      statusFilter === status
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.65)]"
                        : "border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] hover:border-slate-400 hover:bg-white"
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold tracking-[0.18em] ${
                        statusFilter === status ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {status}
                    </p>
                    <p
                      className={`mt-1 text-2xl font-semibold ${
                        statusFilter === status ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {dashboardMetrics.statusCounts[status] ?? 0}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Operator Load
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Current assigned workload, ready jobs, and queue pressure.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Active Jobs
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-950">
                      {dashboardMetrics.activeCount}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {dashboardMetrics.operatorWorkload.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                      No operator assignments yet.
                    </div>
                  ) : (
                    dashboardMetrics.operatorWorkload.map((operator) => (
                      <article
                        key={operator.operator}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {operator.operator}
                            </p>
                            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                              {operator.pending} queued · {operator.ready} ready
                            </p>
                          </div>
                          <p className="text-xl font-semibold text-slate-950">
                            {operator.total}
                          </p>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-slate-900"
                            style={{
                              width: `${Math.max(
                                12,
                                (operator.total /
                                  Math.max(
                                    1,
                                    dashboardMetrics.operatorWorkload[0]?.total ?? 1,
                                  )) *
                                  100,
                              )}%`,
                            }}
                          />
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  KPI Snapshot
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <KpiCard
                    label="Unassigned"
                    value={String(dashboardMetrics.unassignedCount)}
                    helper="Jobs still waiting for operator allocation"
                  />
                  <KpiCard
                    label="Longest Open"
                    value={formatHoursValue(dashboardMetrics.longestOpenHours)}
                    helper="Oldest currently active job"
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Status Distribution
                  </p>
                  <div className="mt-4 space-y-3">
                    {activeTicketStatuses.map((status) => {
                      const count = dashboardMetrics.statusCounts[status] ?? 0;
                      const width = (count / Math.max(1, tickets.length)) * 100;

                      return (
                        <div key={status}>
                          <div className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                            <span>{status}</span>
                            <span>{count}</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-900"
                              style={{ width: `${Math.max(count > 0 ? 8 : 0, width)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

              </>
            ) : null}

            {errorMessage ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                Showing <span className="font-semibold text-slate-900">{pagedTicketRangeLabel}</span> in Parts Control.
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Rows</span>
                  <select
                    value={pageSize}
                    onChange={(event) =>
                      setPageSize(Number(event.target.value) as (typeof ADMIN_PAGE_SIZE_OPTIONS)[number])
                    }
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                  >
                    {ADMIN_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Previous
                  </button>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    Page {safeCurrentPage} / {totalTicketPages}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((current) => Math.min(totalTicketPages, current + 1))}
                    disabled={safeCurrentPage >= totalTicketPages}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Ticket Chats
                  </p>
                  <p className="text-sm leading-6 text-slate-500">
                    Request-linked support threads with unread requester message
                    tracking for the parts team.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                    Unread Requester Messages
                    <NotificationBadge count={totalUnreadChatCount} />
                  </div>
                  <button
                    type="button"
                    onClick={handleReadAllMessages}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Read All Messages
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChatCollapsed((current) => !current)}
                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    {isChatCollapsed ? "Open Ticket Chats" : "Minimise Ticket Chats"}
                  </button>
                </div>
              </div>

              {isChatCollapsed ? (
                <button
                  type="button"
                  onClick={() => setIsChatCollapsed(false)}
                  className="mt-6 w-full rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:shadow-[0_18px_45px_-35px_rgba(15,23,42,0.45)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {totalUnreadChatCount > 0
                          ? `${totalUnreadChatCount} unread requester message${totalUnreadChatCount === 1 ? "" : "s"}`
                          : "No unread requester messages"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        Open the panel to review ticket-linked conversations,
                        respond to submitters, and clear unread items.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[25rem]">
                      {chatTickets.slice(0, 2).map((ticket) => (
                        <ChatTicketSelectorCard
                          key={ticket.id}
                          ticket={ticket}
                          unreadCount={unreadRequesterCountsByTicket[ticket.id] ?? 0}
                          isActive={false}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                </button>
              ) : (
                <>
                  <div className="mt-6 grid gap-3 lg:grid-cols-3">
                    {chatTickets.slice(0, 6).map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => handleSelectChatTicket(ticket.id)}
                        className="text-left"
                      >
                        <ChatTicketSelectorCard
                          ticket={ticket}
                          unreadCount={unreadRequesterCountsByTicket[ticket.id] ?? 0}
                          isActive={selectedChatTicket?.id === ticket.id}
                        />
                      </button>
                    ))}
                  </div>

                  {selectedChatTicket ? (
                    <div className="mt-6">
                      <TicketChatPanel
                        mode="operator"
                        ticketId={selectedChatTicket.id}
                        ticketLabel={selectedChatTicket.job_number}
                        ticketStatus={selectedChatTicket.status ?? "PENDING"}
                        latestUpdate={
                          selectedChatTicket.notes ||
                          selectedChatTicket.request_summary ||
                          "Awaiting Stores update."
                        }
                        assignedTo={selectedChatTicket.assigned_to}
                  messages={mapMessagesToChat(
                    chatMessages,
                    selectedChatTicket,
                    chatAttachments,
                    currentUserId,
                    currentUserDisplayName,
                    chatSenderNameByUserId,
                  )}
                        isSending={isChatSending}
                        isAiLoading={isAiLoading}
                        notice={chatNotice}
                        onSendMessage={handleSendChatMessage}
                        onAskAi={handleAskAi}
                      />
                      {isChatLoading ? (
                        <p className="mt-3 text-sm text-slate-500">
                          Loading chat thread...
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                      Select a ticket to preview its chat thread.
                    </div>
                  )}
                </>
              )}
            </div>

            {viewMode === "table" ? (
              <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200">
              <div className="hidden overflow-x-auto xl:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <th className="px-6 py-4">Request</th>
                      <th className="px-6 py-4">Requester</th>
                      <th className="px-6 py-4">Job Number</th>
                      <th className="px-6 py-4">Request Summary</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Assigned User</th>
                      <th className="px-6 py-4">Notes</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {isLoading ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-10 text-center text-sm text-slate-500"
                        >
                          Loading tickets...
                        </td>
                      </tr>
                    ) : pagedFilteredTickets.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-10 text-center text-sm text-slate-500"
                        >
                          No tickets match the current status filter.
                        </td>
                      </tr>
                    ) : (
                      pagedFilteredTickets.map((ticket) => (
                        <AdminTicketTableRow
                          key={ticket.id}
                          ticket={ticket}
                          draft={drafts[ticket.id]}
                          isCollected={collectedTicketIds.has(ticket.id)}
                          returnedReason={returnedTicketReasonById[ticket.id]}
                          isUpdating={updatingTicketId === ticket.id}
                          onDraftChange={updateTicketDraft}
                          onStatusChange={handleStatusChange}
                          onSave={handleTicketSave}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 bg-slate-50 p-4 xl:hidden">
                {isLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                    Loading tickets...
                  </div>
                ) : pagedFilteredTickets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                    No tickets match the current status filter.
                  </div>
                ) : (
                  pagedFilteredTickets.map((ticket) => (
                    <article
                      key={ticket.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            <Link
                              href={`/tickets/${ticket.id}`}
                              className="transition hover:text-slate-600"
                            >
                              {formatRequestTitle(ticket)}
                            </Link>
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {ticket.requester_name ?? "-"}
                          </p>
                        </div>
                        <StatusBadge status={ticket.status ?? "PENDING"} />
                      </div>

                      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Job Number
                          </dt>
                          <dd className="mt-1 text-sm text-slate-700">
                            {ticket.job_number ?? "-"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Assigned User
                          </dt>
                          <dd className="mt-2">
                            <select
                              value={drafts[ticket.id]?.assigned_to ?? ""}
                              onChange={(event) =>
                                updateTicketDraft(ticket.id, {
                                  assigned_to: event.target.value,
                                })
                              }
                              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                            >
                              <option value="">Stores queue</option>
                              {ADMIN_OPERATOR_OPTIONS.map((operator) => (
                                <option key={operator} value={operator}>
                                  {operator}
                                </option>
                              ))}
                            </select>
                          </dd>
                        </div>
                      </dl>

                      {isOnsiteAdminTicket(ticket) ? (
                        <div className="mt-4">
                          <AdminLocationCard ticket={ticket} />
                        </div>
                      ) : null}

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Request Summary
                        </p>
                        <p className="mt-1 text-sm leading-7 text-slate-600">
                          {ticket.request_summary ?? ticket.request_details ?? "-"}
                        </p>
                        <div className="mt-3">
                          <TicketOperationalSummary ticket={ticket} />
                        </div>
                        {returnedTicketReasonById[ticket.id] ? (
                          <div className="mt-3">
                            <ReturnedBadge reason={returnedTicketReasonById[ticket.id]} />
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Notes
                        </p>
                        <textarea
                          rows={4}
                          value={drafts[ticket.id]?.notes ?? ""}
                          onChange={(event) =>
                            updateTicketDraft(ticket.id, {
                              notes: event.target.value,
                            })
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                        />
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Update Status
                        </p>
                        <div className="mt-2 space-y-3">
                          {collectedTicketIds.has(ticket.id) ? (
                            <CollectedBadge />
                          ) : null}
                          {returnedTicketReasonById[ticket.id] ? (
                            <ReturnedBadge reason={returnedTicketReasonById[ticket.id]} />
                          ) : null}
                          <StatusSelect
                            ticketId={ticket.id}
                            value={ticket.status ?? "PENDING"}
                            onChange={handleStatusChange}
                            disabled={updatingTicketId === ticket.id}
                          />
                          <button
                            type="button"
                            onClick={() => handleTicketSave(ticket.id)}
                            disabled={updatingTicketId === ticket.id}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Save Ticket
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
              </div>
            ) : viewMode === "dynamic" ? (
              <div className="mt-8 grid gap-4 xl:grid-cols-3">
                {activeTicketStatuses.map((status) => {
                  const ticketsInLane = filteredTicketsByStatus[status] ?? [];

                  return (
                    <section
                      key={status}
                      className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {status}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {ticketsInLane.length} active job
                            {ticketsInLane.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <StatusBadge status={status} />
                      </div>

                      <div className="mt-4 space-y-3">
                        {ticketsInLane.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                            No jobs in this workflow lane.
                          </div>
                        ) : (
                          ticketsInLane.map((ticket) => (
                            <Link
                              key={ticket.id}
                              href={`/tickets/${ticket.id}`}
                              className={`block rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_45px_-32px_rgba(15,23,42,0.35)] ${getDynamicCardTone(
                                ticket.status ?? "PENDING",
                              )}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="mb-2 flex items-center gap-3">
                                    {ticket.user_id && profileAvatarByUserId[ticket.user_id] ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={profileAvatarByUserId[ticket.user_id] ?? ""}
                                        alt={ticket.requester_name ?? "Requester"}
                                        className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                                      />
                                    ) : null}
                                    <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      Job {ticket.job_number ?? "Not set"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      {ticket.requester_name ?? "Requester"}
                                    </p>
                                    {collectedTicketIds.has(ticket.id) ? (
                                      <div className="mt-2">
                                        <CollectedBadge />
                                      </div>
                                    ) : null}
                                    {returnedTicketReasonById[ticket.id] ? (
                                      <div className="mt-2">
                                        <ReturnedBadge reason={returnedTicketReasonById[ticket.id]} />
                                      </div>
                                    ) : null}
                                    </div>
                                  </div>
                                </div>
                                <StatusBadge status={ticket.status ?? "PENDING"} />
                              </div>
                              <p className="mt-4 text-sm leading-6 text-slate-700">
                                {ticket.request_summary ?? ticket.request_details ?? "-"}
                              </p>
                              <div className="mt-4">
                                <TicketOperationalSummary ticket={ticket} />
                              </div>
                              <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                                <div>
                                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Machine Ref
                                  </dt>
                                  <dd className="mt-1">{ticket.machine_reference ?? "-"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Department
                                  </dt>
                                  <dd className="mt-1">{ticket.department ?? "-"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Assigned User
                                  </dt>
                                  <dd className="mt-1">{ticket.assigned_to ?? "Stores queue"}</dd>
                                </div>
                                <div>
                                  <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Last Updated
                                  </dt>
                                  <dd className="mt-1">{formatDateTime(ticket.updated_at)}</dd>
                                </div>
                              </dl>
                            </Link>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {isLoading ? (
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Loading active jobs...
                  </div>
                ) : pagedFilteredTickets.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                    No active tickets match the current status filter.
                  </div>
                ) : (
                  pagedFilteredTickets.map((ticket) => (
                    <AdminCompactTicketCard
                      key={ticket.id}
                      ticket={ticket}
                      draft={drafts[ticket.id]}
                      isCollected={collectedTicketIds.has(ticket.id)}
                      returnedReason={returnedTicketReasonById[ticket.id]}
                      isUpdating={updatingTicketId === ticket.id}
                      onDraftChange={updateTicketDraft}
                      onStatusChange={handleStatusChange}
                      onSave={handleTicketSave}
                    />
                  ))
                )}
              </div>
            )}
              </>
            ) : null}
          </section>
          </>
        </AuthGuard>
      </div>
    </main>
  );
}

const AdminTicketTableRow = memo(function AdminTicketTableRow({
  ticket,
  draft,
  isCollected,
  returnedReason,
  isUpdating,
  onDraftChange,
  onStatusChange,
  onSave,
}: {
  ticket: Ticket;
  draft?: { assigned_to: string; notes: string };
  isCollected: boolean;
  returnedReason?: string;
  isUpdating: boolean;
  onDraftChange: (ticketId: string, patch: Partial<{ assigned_to: string; notes: string }>) => void;
  onStatusChange: (ticketId: string, nextStatus: TicketStatus) => void;
  onSave: (ticketId: string) => void;
}) {
  return (
    <tr className="align-top">
      <td className="px-6 py-5 text-sm font-semibold text-slate-900">
        <Link
          href={`/tickets/${ticket.id}`}
          className="transition hover:text-slate-600"
        >
          {formatRequestTitle(ticket)}
        </Link>
      </td>
      <td className="px-6 py-5 text-sm text-slate-600">
        <div className="space-y-1">
          <p>{ticket.requester_name ?? "-"}</p>
          <div className="text-xs text-slate-500">
            <p>{ticket.department ?? "-"}</p>
            {isOnsiteAdminTicket(ticket) ? (
              <AdminLocationLink ticket={ticket} compact />
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-6 py-5 text-sm text-slate-600">
        <div className="space-y-1">
          <p>{ticket.job_number ?? "-"}</p>
          <p className="text-xs text-slate-500">
            {ticket.machine_reference ?? "-"}
          </p>
        </div>
      </td>
      <td className="px-6 py-5 text-sm leading-7 text-slate-600">
        <div className="space-y-2">
          <p>{ticket.request_summary ?? ticket.request_details ?? "-"}</p>
          <TicketOperationalSummary ticket={ticket} compact />
          {returnedReason ? (
            <ReturnedBadge reason={returnedReason} />
          ) : null}
        </div>
      </td>
      <td className="px-6 py-5">
        <StatusBadge status={ticket.status ?? "PENDING"} />
      </td>
      <td className="px-6 py-5">
        <select
          value={draft?.assigned_to ?? ""}
          onChange={(event) =>
            onDraftChange(ticket.id, {
              assigned_to: event.target.value,
            })
          }
          className="w-40 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
        >
          <option value="">Stores queue</option>
          {ADMIN_OPERATOR_OPTIONS.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
      </td>
      <td className="px-6 py-5">
        <textarea
          rows={3}
          value={draft?.notes ?? ""}
          onChange={(event) =>
            onDraftChange(ticket.id, {
              notes: event.target.value,
            })
          }
          className="w-56 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
        />
      </td>
      <td className="px-6 py-5">
        <div className="space-y-3">
          {isCollected ? (
            <CollectedBadge />
          ) : null}
          {returnedReason ? (
            <ReturnedBadge reason={returnedReason} />
          ) : null}
          <StatusSelect
            ticketId={ticket.id}
            value={ticket.status ?? "PENDING"}
            onChange={onStatusChange}
            disabled={isUpdating}
          />
          <button
            type="button"
            onClick={() => onSave(ticket.id)}
            disabled={isUpdating}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
});

const AdminCompactTicketCard = memo(function AdminCompactTicketCard({
  ticket,
  draft,
  isCollected,
  returnedReason,
  isUpdating,
  onDraftChange,
  onStatusChange,
  onSave,
}: {
  ticket: Ticket;
  draft?: { assigned_to: string; notes: string };
  isCollected: boolean;
  returnedReason?: string;
  isUpdating: boolean;
  onDraftChange: (ticketId: string, patch: Partial<{ assigned_to: string; notes: string }>) => void;
  onStatusChange: (ticketId: string, nextStatus: TicketStatus) => void;
  onSave: (ticketId: string) => void;
}) {
  return (
    <article
      className={`rounded-3xl border p-5 shadow-sm ${getCompactStatusCardTone(
        ticket.status ?? "PENDING",
      )}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            <Link href={`/tickets/${ticket.id}`} className="transition hover:text-slate-600">
              {formatRequestTitle(ticket)}
            </Link>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {ticket.requester_name ?? "-"}
          </p>
          {isCollected ? (
            <div className="mt-2">
              <CollectedBadge />
            </div>
          ) : null}
          {returnedReason ? (
            <div className="mt-2">
              <ReturnedBadge reason={returnedReason} />
            </div>
          ) : null}
        </div>
        <StatusBadge status={ticket.status ?? "PENDING"} />
      </div>
      <p className="mt-4 text-sm leading-7 text-slate-700">
        {ticket.request_summary ?? ticket.request_details ?? "-"}
      </p>
      <div className="mt-4">
        <TicketOperationalSummary ticket={ticket} />
      </div>
      <dl className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Job Number</dt>
          <dd className="mt-1">{ticket.job_number ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Machine Ref</dt>
          <dd className="mt-1">{ticket.machine_reference ?? "-"}</dd>
        </div>
      </dl>
      {isOnsiteAdminTicket(ticket) ? (
        <div className="mt-4">
          <AdminLocationCard ticket={ticket} />
        </div>
      ) : null}
      <div className="mt-4 grid gap-3">
        <select
          value={draft?.assigned_to ?? ""}
          onChange={(event) =>
            onDraftChange(ticket.id, {
              assigned_to: event.target.value,
            })
          }
          className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
        >
          <option value="">Stores queue</option>
          {ADMIN_OPERATOR_OPTIONS.map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </select>
        <textarea
          rows={3}
          value={draft?.notes ?? ""}
          onChange={(event) =>
            onDraftChange(ticket.id, {
              notes: event.target.value,
            })
          }
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
        />
        <StatusSelect
          ticketId={ticket.id}
          value={ticket.status ?? "PENDING"}
          onChange={onStatusChange}
          disabled={isUpdating}
        />
        <button
          type="button"
          onClick={() => onSave(ticket.id)}
          disabled={isUpdating}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save Ticket
        </button>
      </div>
    </article>
  );
});

function PendingRequestBanner({
  item,
  onDismiss,
}: {
  item: AdminOversightItem;
  onDismiss: (id: string) => void;
}) {
  return (
    <section className="aurora-section border-amber-200 bg-amber-50/90 p-5 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.45)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800">
            New Requests
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            {item.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {item.body}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.href ? (
            <Link
              href={item.href}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-950 bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {item.actionLabel ?? "Open Request"}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:border-amber-400 hover:bg-amber-100"
          >
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

function mapMessagesToChat(
  messages: TicketMessageRecord[],
  ticket: Ticket,
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

function AdminSupportPanel({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: { heading: string; body: string }[];
}) {
  return (
    <section className="aurora-section">
      <div className="space-y-2">
        <p className="aurora-kicker">
          {title}
        </p>
        <p className="text-sm leading-6 text-[color:var(--foreground-muted)]">{description}</p>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.heading}
            className="aurora-panel p-5"
          >
            <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">{item.heading}</p>
            <p className="mt-3 text-sm leading-7 text-[color:var(--foreground-muted)]">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChatTicketSelectorCard({
  ticket,
  unreadCount,
  isActive,
  compact = false,
}: {
  ticket: Ticket;
  unreadCount: number;
  isActive: boolean;
  compact?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        isActive
          ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_-28px_rgba(15,23,42,0.65)]"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_18px_40px_-36px_rgba(15,23,42,0.45)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={`text-sm font-semibold ${
              isActive ? "text-white" : "text-slate-900"
            }`}
          >
            Job {ticket.job_number ?? "Not set"}
          </p>
          <p
            className={`mt-1 text-sm ${
              isActive ? "text-slate-300" : "text-slate-500"
            }`}
          >
            {ticket.requester_name ?? "Requester"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 ? <NotificationBadge count={unreadCount} /> : null}
          <StatusBadge status={ticket.status ?? "PENDING"} />
        </div>
      </div>
      <p
        className={`mt-3 text-sm leading-6 ${
          isActive ? "text-slate-200" : "text-slate-600"
        }`}
      >
        {truncateSummary(ticket.request_summary ?? ticket.request_details ?? "No request summary.")}
      </p>
      {!compact ? (
        <p
          className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] ${
            isActive ? "text-slate-400" : "text-slate-400"
          }`}
        >
          {ticket.machine_reference ?? "No machine ref"}
        </p>
      ) : null}
    </article>
  );
}

function isOnsiteAdminTicket(ticket: Ticket) {
  return ticket.department === "Onsite";
}

function AdminLocationCard({ ticket }: { ticket: Ticket }) {
  const mapUrl = buildAdminMapUrl(ticket);
  const summary = formatAdminLocationSummary(ticket);

  if (!summary && !mapUrl) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Onsite Location
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        {summary || "Onsite location captured"}
      </p>
      {ticket.location_confirmed ? (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Confirmed on submission
        </p>
      ) : null}
      {mapUrl ? (
        <a
          href={mapUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          View Onsite Location
        </a>
      ) : null}
    </div>
  );
}

function AdminLocationLink({
  ticket,
  compact = false,
}: {
  ticket: Ticket;
  compact?: boolean;
}) {
  const mapUrl = buildAdminMapUrl(ticket);

  if (!mapUrl) {
    return null;
  }

  return (
    <a
      href={mapUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex font-semibold text-sky-700 transition hover:text-sky-900 ${
        compact ? "mt-1 text-[11px]" : "text-sm"
      }`}
    >
      Open in Maps
    </a>
  );
}

function formatAdminLocationSummary(ticket: Ticket) {
  return formatOnsiteLocationSummary(ticket);
}

function buildAdminMapUrl(ticket: Ticket) {
  return buildOnsiteLocationMapUrl(ticket);
}

function resolveSenderName(
  message: TicketMessageRecord,
  ticket: Ticket,
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
      return currentUserDisplayName || "Stores Operator";
    }

    return ticket.assigned_to || "Stores Operator";
  }

  return ticket.assigned_to || "Stores Operator";
}

function StatusSelect({
  ticketId,
  value,
  onChange,
  disabled = false,
}: {
  ticketId: string;
  value: TicketStatus;
  onChange: (ticketId: string, nextStatus: TicketStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) =>
        onChange(ticketId, event.target.value as TicketStatus)
      }
      className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {activeTicketStatuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
      <option value="COMPLETED">COMPLETED</option>
    </select>
  );
}

function TicketOperationalSummary({
  ticket,
  compact = false,
}: {
  ticket: Ticket;
  compact?: boolean;
}) {
  const hasExpectedDelivery = Boolean(ticket.expected_delivery_date?.trim());
  const hasBinLocation = Boolean(ticket.bin_location?.trim());
  const hasLeadTimeNote = Boolean(ticket.lead_time_note?.trim());
  const hasPurchaseOrderNumber = Boolean(ticket.purchase_order_number?.trim());
  const hasSupplierName = Boolean(ticket.supplier_name?.trim());
  const hasOrderAmount = typeof ticket.order_amount === "number" && !Number.isNaN(ticket.order_amount);
  const isOverdue = isTicketOrderOverdue(ticket);

  if (!hasExpectedDelivery && !hasBinLocation && !hasLeadTimeNote && !hasPurchaseOrderNumber && !hasSupplierName && !hasOrderAmount) {
    return null;
  }

  return (
    <div className={`space-y-2 ${compact ? "" : "rounded-2xl border border-slate-200 bg-white/75 p-3"}`}>
      {hasExpectedDelivery ? (
        <p className="text-xs text-slate-500">
          Expected delivery{" "}
          <span className="font-semibold text-slate-700">
            {formatOperationalDate(ticket.expected_delivery_date)}
          </span>
          {isOverdue ? (
            <span className="ml-2 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
              Overdue
            </span>
          ) : null}
        </p>
      ) : null}
      {hasBinLocation ? (
        <p className="text-xs text-slate-500">
          Bin{" "}
          <span className="font-semibold text-emerald-700">
            {ticket.bin_location}
          </span>
        </p>
      ) : null}
      {hasSupplierName || hasPurchaseOrderNumber || hasOrderAmount ? (
        <p className="text-xs leading-5 text-slate-500">
          {hasSupplierName ? (
            <>
              Supplier <span className="font-semibold text-slate-700">{ticket.supplier_name}</span>
            </>
          ) : null}
          {hasSupplierName && hasPurchaseOrderNumber ? " · " : null}
          {hasPurchaseOrderNumber ? (
            <>
              PO <span className="font-semibold text-slate-700">{ticket.purchase_order_number}</span>
            </>
          ) : null}
          {(hasSupplierName || hasPurchaseOrderNumber) && hasOrderAmount ? " · " : null}
          {hasOrderAmount ? (
            <span className="font-semibold text-slate-700">{formatOrderAmount(ticket.order_amount)}</span>
          ) : null}
        </p>
      ) : null}
      {hasLeadTimeNote ? (
        <p className="text-xs leading-5 text-slate-500">
          {ticket.lead_time_note}
        </p>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{helper}</p>
    </div>
  );
}

function CollectedBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
      Collected
    </div>
  );
}

function ReturnedBadge({ reason }: { reason: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-900">
      <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100 px-3 py-1.5 font-semibold uppercase tracking-[0.16em] text-amber-800">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
        Returned
      </div>
      <p className="mt-2 leading-6">{reason}</p>
    </div>
  );
}

function getLongestOpenHours(tickets: Ticket[]) {
  const durations = tickets
    .map((ticket) => getDurationHours(ticket.created_at, new Date().toISOString()))
    .filter((value): value is number => value !== null);

  if (durations.length === 0) {
    return null;
  }

  return Math.max(...durations);
}

function getDurationHours(start?: string | null, end?: string | null) {
  if (!start || !end) {
    return null;
  }

  const duration = new Date(end).getTime() - new Date(start).getTime();

  if (Number.isNaN(duration) || duration < 0) {
    return null;
  }

  return duration / 1000 / 60 / 60;
}

function formatHoursValue(value: number | null) {
  if (value === null) {
    return "-";
  }

  if (value < 24) {
    return `${value.toFixed(1)}h`;
  }

  return `${(value / 24).toFixed(1)}d`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isSameCalendarDay(value?: string | null) {
  if (!value) {
    return false;
  }

  const target = new Date(value);
  const today = new Date();

  return (
    target.getFullYear() === today.getFullYear() &&
    target.getMonth() === today.getMonth() &&
    target.getDate() === today.getDate()
  );
}

function truncateSummary(value: string) {
  return value.length > 88 ? `${value.slice(0, 85)}...` : value;
}

function formatRequestTitle(ticket: Ticket) {
  const summary = ticket.request_summary ?? ticket.request_details ?? "No request summary";
  const jobLabel = ticket.job_number ? `Job ${ticket.job_number}` : "Job not set";
  return `${jobLabel} | ${truncateSummary(summary)}`;
}

function getCompactStatusCardTone(status: TicketStatus) {
  switch (status) {
    case "PENDING":
      return "border-rose-200 bg-rose-50";
    case "QUERY":
      return "border-orange-200 bg-orange-50";
    case "IN_PROGRESS":
      return "border-blue-200 bg-blue-50";
    case "ORDERED":
      return "border-sky-200 bg-sky-50";
    case "READY":
      return "border-emerald-200 bg-emerald-50";
    case "ESTIMATE":
      return "border-violet-200 bg-violet-50";
    case "QUOTE":
      return "border-fuchsia-200 bg-fuchsia-50";
    default:
      return "border-slate-200 bg-white";
  }
}

function getDynamicCardTone(status: TicketStatus) {
  switch (status) {
    case "PENDING":
      return "border-rose-200";
    case "QUERY":
      return "border-orange-200";
    case "IN_PROGRESS":
      return "border-blue-200";
    case "ORDERED":
      return "border-sky-200";
    case "READY":
      return "border-emerald-200";
    case "ESTIMATE":
      return "border-violet-200";
    case "QUOTE":
      return "border-fuchsia-200";
    default:
      return "border-slate-200";
  }
}

function matchesDateFilter(
  value: string | null | undefined,
  filter: "ALL" | "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS",
) {
  if (filter === "ALL") {
    return true;
  }

  if (!value) {
    return false;
  }

  const target = new Date(value).getTime();

  if (Number.isNaN(target)) {
    return false;
  }

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (filter === "TODAY") {
    return isSameCalendarDay(value);
  }

  if (filter === "LAST_7_DAYS") {
    return now - target <= oneDayMs * 7;
  }

  if (filter === "LAST_30_DAYS") {
    return now - target <= oneDayMs * 30;
  }

  return true;
}
