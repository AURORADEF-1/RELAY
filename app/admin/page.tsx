"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { NotificationBadge } from "@/components/notification-badge";
import { useNotifications } from "@/components/notification-provider";
import { LogoutButton } from "@/components/logout-button";
import { PartsControlTabs } from "@/components/parts-control-tabs";
import { RelayLogo } from "@/components/relay-logo";
import { StatusBadge } from "@/components/status-badge";
import {
  type ChatMessage,
  TicketChatPanel,
} from "@/components/ticket-chat-panel";
import {
  createTicketMessage,
  fetchTicketAttachments,
  fetchTicketMessages,
  type TicketAttachmentRecord,
  type TicketMessageRecord,
  uploadTicketAttachments,
} from "@/lib/relay-ticketing";
import type { RelayAiContext } from "@/lib/relay-ai";
import {
  notifyRequesterOfOperatorMessage,
  notifyRequesterStatusChanged,
} from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import {
  activeTicketStatusOptions,
  activeTicketStatuses,
  type ActiveTicketStatusFilter,
  type TicketStatus,
} from "@/lib/statuses";
import { triggerActionFeedback } from "@/lib/action-feedback";
import { getSupabaseClient } from "@/lib/supabase";

const ADMIN_CHAT_READ_STORAGE_KEY = "relay-admin-chat-last-opened";
const ADMIN_DASHBOARD_VIEW_STORAGE_KEY = "relay-admin-dashboard-view-mode";

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
  created_at?: string | null;
  updated_at?: string | null;
};

export default function AdminPage() {
  const router = useRouter();
  const { requesterUnreadCount, adminBadgeCount } = useNotifications();
  const [isKpiMinimized, setIsKpiMinimized] = useState(false);
  const [assignedUserFilter, setAssignedUserFilter] = useState("");
  const [dateFilter, setDateFilter] = useState<"ALL" | "TODAY" | "LAST_7_DAYS" | "LAST_30_DAYS">(
    "ALL",
  );
  const [departmentFilter, setDepartmentFilter] = useState<"ALL" | "Onsite" | "Yard">("ALL");
  const [statusFilter, setStatusFilter] = useState<ActiveTicketStatusFilter>("ALL");
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
  const [drafts, setDrafts] = useState<Record<string, { assigned_to: string; notes: string }>>(
    {},
  );
  const [selectedChatTicketId, setSelectedChatTicketId] = useState<string | null>(null);
  const [chatAttachments, setChatAttachments] = useState<TicketAttachmentRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<TicketMessageRecord[]>([]);
  const [requesterMessagesByTicket, setRequesterMessagesByTicket] = useState<
    Record<string, TicketMessageRecord[]>
  >({});
  const [readRequesterMessageByTicket, setReadRequesterMessageByTicket] = useState<
    Record<string, string>
  >({});
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const [resourceTab, setResourceTab] = useState<"operations" | "guide" | "faq">(
    "operations",
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "guide" || tab === "faq") {
      setResourceTab(tab);
      return;
    }

    setResourceTab("operations");
  }, []);

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
    setIsLoading(true);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setTickets([]);
      setErrorMessage("Supabase environment variables are not configured.");
      setIsLoading(false);
      return;
    }

    const { user, isAdmin } = await getCurrentUserWithRole(supabase);

    if (!user) {
      router.replace("/login?next=/admin");
      return;
    }

    if (!isAdmin) {
      router.replace("/");
      return;
    }

    setCurrentUserId(user.id);

    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, user_id, requester_name, department, location_lat, location_lng, location_summary, location_confirmed, machine_reference, job_number, request_summary, request_details, status, assigned_to, notes, created_at, updated_at",
      )
      .neq("status", "COMPLETED")
      .order("updated_at", { ascending: false });

    if (error) {
      setTickets([]);
      setErrorMessage(error.message);
      setIsLoading(false);
      return;
    }

    const nextTickets = (data ?? []) as Ticket[];
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
    setSelectedChatTicketId(nextTickets[0]?.id ?? null);
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTickets();
    }, 0);

    return () => window.clearTimeout(timeoutId);
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

  const dashboardMetrics = useMemo(() => {
    const activeTickets = tickets;
    const unassignedCount = activeTickets.filter((ticket) => !ticket.assigned_to?.trim()).length;

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
    };
  }, [tickets]);

  const selectedChatTicket =
    filteredTickets.find((ticket) => ticket.id === selectedChatTicketId) ??
    tickets.find((ticket) => ticket.id === selectedChatTicketId) ??
    filteredTickets[0] ??
    null;

  useEffect(() => {
    let isMounted = true;

    async function loadRequesterMessages() {
      const ticketIds = tickets.map((ticket) => ticket.id);

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

      if (!isMounted || error) {
        return;
      }

      const grouped = ((data ?? []) as TicketMessageRecord[]).reduce<
        Record<string, TicketMessageRecord[]>
      >((accumulator, message) => {
        accumulator[message.ticket_id] = [...(accumulator[message.ticket_id] ?? []), message];
        return accumulator;
      }, {});

      setRequesterMessagesByTicket(grouped);
    }

    loadRequesterMessages();

    return () => {
      isMounted = false;
    };
  }, [tickets]);

  useEffect(() => {
    if (isChatCollapsed || !selectedChatTicket?.id) {
      return;
    }

    const latestRequesterMessage =
      requesterMessagesByTicket[selectedChatTicket.id]?.[0]?.created_at;

    if (!latestRequesterMessage) {
      return;
    }

    setReadRequesterMessageByTicket((current) => {
      if (current[selectedChatTicket.id] === latestRequesterMessage) {
        return current;
      }

      const nextState = {
        ...current,
        [selectedChatTicket.id]: latestRequesterMessage,
      };

      window.sessionStorage.setItem(
        ADMIN_CHAT_READ_STORAGE_KEY,
        JSON.stringify(nextState),
      );

      return nextState;
    });
  }, [isChatCollapsed, selectedChatTicket?.id, requesterMessagesByTicket]);

  useEffect(() => {
    let isMounted = true;

    async function loadTicketMessages() {
      if (!selectedChatTicket) {
        setChatAttachments([]);
        setChatMessages([]);
        return;
      }

      const supabase = getSupabaseClient();

      if (!supabase) {
        if (isMounted) {
          setErrorMessage("Supabase environment variables are not configured.");
        }
        return;
      }

      setIsChatLoading(true);

      try {
        const [attachments, messages] = await Promise.all([
          fetchTicketAttachments(supabase, selectedChatTicket.id),
          fetchTicketMessages(supabase, selectedChatTicket.id),
        ]);

        if (isMounted) {
          setChatAttachments(attachments);
          setChatMessages(messages);
        }
      } catch (chatError) {
        if (isMounted) {
          setErrorMessage(
            chatError instanceof Error
              ? chatError.message
              : "Failed to load ticket chat.",
          );
        }
      } finally {
        if (isMounted) {
          setIsChatLoading(false);
        }
      }
    }

    loadTicketMessages();

    return () => {
      isMounted = false;
    };
  }, [selectedChatTicket]);

  async function handleStatusChange(ticketId: string, nextStatus: TicketStatus) {
    const currentTicket = tickets.find((ticket) => ticket.id === ticketId);

    if (!currentTicket || currentTicket.status === nextStatus) {
      return;
    }

    setUpdatingTicketId(ticketId);
    setErrorMessage("");

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setUpdatingTicketId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("tickets")
      .update({ status: nextStatus })
      .eq("id", ticketId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setUpdatingTicketId(null);
      return;
    }

    const { error: insertError } = await supabase
      .from("ticket_updates")
      .insert({ ticket_id: ticketId, status: nextStatus });

    if (insertError) {
      setErrorMessage(insertError.message);
      setUpdatingTicketId(null);
      return;
    }

    try {
      await notifyRequesterStatusChanged(supabase, {
        userId: currentTicket.user_id,
        ticketId,
        jobNumber: currentTicket.job_number,
        nextStatus,
        requestSummary: currentTicket.request_summary ?? currentTicket.request_details,
      });
    } catch (notificationError) {
      console.error("Failed to notify requester about status change", notificationError);
    }

    setTickets((current) =>
      nextStatus === "COMPLETED"
        ? current.filter((ticket) => ticket.id !== ticketId)
        : current.map((ticket) =>
            ticket.id === ticketId ? { ...ticket, status: nextStatus } : ticket,
          ),
    );
    if (selectedChatTicketId === ticketId && nextStatus === "COMPLETED") {
      setSelectedChatTicketId(null);
    }
    setUpdatingTicketId(null);
  }

  async function handleTicketSave(ticketId: string) {
    const supabase = getSupabaseClient();
    const draft = drafts[ticketId];

    if (!supabase || !draft) {
      setErrorMessage("Supabase environment variables are not configured.");
      return;
    }

    setUpdatingTicketId(ticketId);
    setErrorMessage("");

    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        assigned_to: draft.assigned_to || null,
        notes: draft.notes || null,
      })
      .eq("id", ticketId);

    if (updateError) {
      setErrorMessage(updateError.message);
      setUpdatingTicketId(null);
      return;
    }

    if (draft.notes.trim()) {
      const { error: insertError } = await supabase.from("ticket_updates").insert({
        ticket_id: ticketId,
        comment: draft.notes.trim(),
      });

      if (insertError) {
        setErrorMessage(insertError.message);
        setUpdatingTicketId(null);
        return;
      }
    }

    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              assigned_to: draft.assigned_to || null,
              notes: draft.notes || null,
            }
          : ticket,
      ),
    );
    setUpdatingTicketId(null);
  }

  async function reloadSelectedChatMessages(
    supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
    activeTicketId: string,
  ) {
    const [attachments, messages] = await Promise.all([
      fetchTicketAttachments(supabase, activeTicketId),
      fetchTicketMessages(supabase, activeTicketId),
    ]);
    setChatAttachments(attachments);
    setChatMessages(messages);
  }

  function markTicketChatRead(ticketId: string) {
    const latestRequesterMessage = requesterMessagesByTicket[ticketId]?.[0]?.created_at;

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
  }

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

  const totalUnreadChatCount = useMemo(
    () => Object.values(unreadRequesterCountsByTicket).reduce((sum, count) => sum + count, 0),
    [unreadRequesterCountsByTicket],
  );

  async function handleSendChatMessage(payload: { messageText: string; files: File[] }) {
    if (!selectedChatTicket) {
      return false;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      setErrorMessage("Supabase environment variables are not configured.");
      setChatNotice({
        type: "error",
        message: "Supabase environment variables are not configured.",
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
      try {
        await notifyRequesterOfOperatorMessage(supabase, {
          userId: selectedChatTicket.user_id,
          ticketId: selectedChatTicket.id,
          jobNumber: selectedChatTicket.job_number,
          assignedTo: selectedChatTicket.assigned_to,
          requestSummary:
            selectedChatTicket.request_summary ?? selectedChatTicket.request_details,
        });
      } catch (notificationError) {
        console.error("Failed to notify requester about operator reply", notificationError);
      }
      triggerActionFeedback();
      await reloadSelectedChatMessages(supabase, selectedChatTicket.id);
      return true;
    } catch (chatError) {
      console.error("Admin ticket chat send failed", chatError);
      const message =
        chatError instanceof Error ? chatError.message : "Failed to send chat reply.";
      setErrorMessage(
        message,
      );
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
        aiError instanceof Error ? aiError.message : "Failed to get AI response.",
      );
    } finally {
      setIsAiLoading(false);
    }
  }

  function handleSelectChatTicket(ticketId: string) {
    setSelectedChatTicketId(ticketId);
    setIsChatCollapsed(false);
    markTicketChatRead(ticketId);
  }

  function handleReadAllMessages() {
    const nextState = Object.fromEntries(
      Object.entries(requesterMessagesByTicket)
        .filter(([, messages]) => messages[0]?.created_at)
        .map(([ticketId, messages]) => [ticketId, messages[0]?.created_at as string]),
    );

    setReadRequesterMessageByTicket(nextState);
    window.sessionStorage.setItem(
      ADMIN_CHAT_READ_STORAGE_KEY,
      JSON.stringify(nextState),
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_48%,#e2e8f0_100%)] px-6 py-8 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <nav className="flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_-34px_rgba(15,23,42,0.35)] backdrop-blur">
          <RelayLogo />
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600">
            <Link href="/" className="rounded-full px-4 py-2 hover:bg-white">
              Home
            </Link>
            <Link href="/legal" className="rounded-full px-4 py-2 hover:bg-white">
              Legal
            </Link>
            <Link
              href="/submit"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              Submit Ticket
            </Link>
            <Link
              href="/requests"
              className="rounded-full px-4 py-2 hover:bg-white"
            >
              My Requests
              <NotificationBadge count={requesterUnreadCount} />
            </Link>
            <Link href="/control" className="rounded-full px-4 py-2 hover:bg-white">
              Workshop Control
            </Link>
            <Link href="/wallboard" className="rounded-full px-4 py-2 hover:bg-white">
              Live Wallboard
            </Link>
            <Link
              href="/admin"
              className="rounded-full bg-slate-950 px-4 py-2 text-white hover:bg-slate-800"
            >
              Parts Control
              <NotificationBadge count={adminBadgeCount} />
            </Link>
            <LogoutButton />
          </div>
        </nav>

        <AuthGuard requiredRole="admin">
          <section className="rounded-[2rem] border border-white/80 bg-white/90 p-8 shadow-[0_28px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur sm:p-10">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">
                  Parts Control
                </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                  Parts Control
                  <NotificationBadge count={adminBadgeCount} />
                </h1>
                <p className="text-base leading-8 text-slate-600">
                  Monitor live request activity, manage workflow status, and control operational workload in real time.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="text-sm font-medium text-slate-600">
                  Filter by status
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ActiveTicketStatusFilter)
                  }
                  className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
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
                  className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
                />
                <select
                  value={departmentFilter}
                  onChange={(event) =>
                    setDepartmentFilter(
                      event.target.value as "ALL" | "Onsite" | "Yard",
                    )
                  }
                  className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
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
                  className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
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
                  className="h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400"
                >
                  <option value="table">Table View</option>
                  <option value="compact">Compact Summary</option>
                  <option value="dynamic">Dynamic View</option>
                </select>
                {statusFilter !== "ALL" ? (
                  <button
                    type="button"
                    onClick={() => setStatusFilter("ALL")}
                    className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                  >
                    Show All
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-8">
              <PartsControlTabs activeTab={resourceTab} />
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
                        "Use Parts Control or Workshop Control to assign the request to a user, add notes, and move the status through the active workflow.",
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
                      {tickets.filter((ticket) => ticket.status === status).length}
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
                      const count = tickets.filter((ticket) => ticket.status === status).length;
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
                    ) : filteredTickets.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-6 py-10 text-center text-sm text-slate-500"
                        >
                          No tickets match the current status filter.
                        </td>
                      </tr>
                    ) : (
                      filteredTickets.map((ticket) => (
                        <tr key={ticket.id} className="align-top">
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
                            {ticket.request_summary ?? ticket.request_details ?? "-"}
                          </td>
                          <td className="px-6 py-5">
                            <StatusBadge status={ticket.status ?? "PENDING"} />
                          </td>
                          <td className="px-6 py-5">
                            <input
                              type="text"
                              value={drafts[ticket.id]?.assigned_to ?? ""}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [ticket.id]: {
                                    assigned_to: event.target.value,
                                    notes: current[ticket.id]?.notes ?? "",
                                  },
                                }))
                              }
                              className="w-40 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                            />
                          </td>
                          <td className="px-6 py-5">
                            <textarea
                              rows={3}
                              value={drafts[ticket.id]?.notes ?? ""}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [ticket.id]: {
                                    assigned_to: current[ticket.id]?.assigned_to ?? "",
                                    notes: event.target.value,
                                  },
                                }))
                              }
                              className="w-56 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                            />
                          </td>
                          <td className="px-6 py-5">
                            <div className="space-y-3">
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
                                Save
                              </button>
                            </div>
                          </td>
                        </tr>
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
                ) : filteredTickets.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                    No tickets match the current status filter.
                  </div>
                ) : (
                  filteredTickets.map((ticket) => (
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
                            <input
                              type="text"
                              value={drafts[ticket.id]?.assigned_to ?? ""}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [ticket.id]: {
                                    assigned_to: event.target.value,
                                    notes: current[ticket.id]?.notes ?? "",
                                  },
                                }))
                              }
                              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                            />
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
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Notes
                        </p>
                        <textarea
                          rows={4}
                          value={drafts[ticket.id]?.notes ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [ticket.id]: {
                                assigned_to: current[ticket.id]?.assigned_to ?? "",
                                notes: event.target.value,
                              },
                            }))
                          }
                          className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                        />
                      </div>

                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Update Status
                        </p>
                        <div className="mt-2 space-y-3">
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
                  const ticketsInLane = filteredTickets.filter(
                    (ticket) => ticket.status === status,
                  );

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
                                  <p className="text-sm font-semibold text-slate-900">
                                    Job {ticket.job_number ?? "Not set"}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-500">
                                    {ticket.requester_name ?? "Requester"}
                                  </p>
                                </div>
                                <StatusBadge status={ticket.status ?? "PENDING"} />
                              </div>
                              <p className="mt-4 text-sm leading-6 text-slate-700">
                                {ticket.request_summary ?? ticket.request_details ?? "-"}
                              </p>
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
                ) : filteredTickets.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                    No active tickets match the current status filter.
                  </div>
                ) : (
                  filteredTickets.map((ticket) => (
                    <article
                      key={ticket.id}
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
                        </div>
                        <StatusBadge status={ticket.status ?? "PENDING"} />
                      </div>
                      <p className="mt-4 text-sm leading-7 text-slate-700">
                        {ticket.request_summary ?? ticket.request_details ?? "-"}
                      </p>
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
                        <input
                          type="text"
                          value={drafts[ticket.id]?.assigned_to ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [ticket.id]: {
                                assigned_to: event.target.value,
                                notes: current[ticket.id]?.notes ?? "",
                              },
                            }))
                          }
                          placeholder="Assigned user"
                          className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                        />
                        <textarea
                          rows={3}
                          value={drafts[ticket.id]?.notes ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [ticket.id]: {
                                assigned_to: current[ticket.id]?.assigned_to ?? "",
                                notes: event.target.value,
                              },
                            }))
                          }
                          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                        />
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
                    </article>
                  ))
                )}
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
  ticket: Ticket,
  attachments: TicketAttachmentRecord[],
): ChatMessage[] {
  return messages.map((message) => {
    const attachment = attachments.find(
      (candidate) => candidate.message_id === message.id,
    );

    return {
      id: message.id,
      senderName: resolveSenderName(message, ticket),
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
    <section className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
        <p className="text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.heading}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <p className="text-sm font-semibold text-slate-900">{item.heading}</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">{item.body}</p>
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
  if (ticket.location_summary?.trim()) {
    return ticket.location_summary.trim();
  }

  if (
    typeof ticket.location_lat === "number" &&
    typeof ticket.location_lng === "number"
  ) {
    return `${ticket.location_lat.toFixed(5)}, ${ticket.location_lng.toFixed(5)}`;
  }

  return null;
}

function buildAdminMapUrl(ticket: Ticket) {
  if (
    typeof ticket.location_lat === "number" &&
    typeof ticket.location_lng === "number"
  ) {
    return `https://www.google.com/maps?q=${ticket.location_lat},${ticket.location_lng}`;
  }

  if (ticket.location_summary?.trim()) {
    return `https://www.google.com/maps?q=${encodeURIComponent(ticket.location_summary.trim())}`;
  }

  return null;
}

function resolveSenderName(message: TicketMessageRecord, ticket: Ticket) {
  if (message.is_ai_message || message.sender_role === "ai") {
    return "RELAY Assistant";
  }

  if (message.sender_role === "requester") {
    return ticket.requester_name ?? "Requester";
  }

  if (message.sender_role === "admin") {
    return "Administrator";
  }

  if (message.sender_role === "operator") {
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
