"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { TicketChatPanel, type ChatMessage } from "@/components/ticket-chat-panel";
import {
  fetchUnreadNotifications,
  markNotificationsRead,
  notifyAdminsOfRequesterMessage,
  notifyRequesterOfOperatorMessage,
  type RelayNotificationRecord,
} from "@/lib/notifications";
import {
  fetchProfileDisplayNamesByUserId,
  getCurrentUserWithRole,
} from "@/lib/profile-access";
import {
  createTicketMessage,
  fetchTicketAttachments,
  fetchTicketMessages,
  uploadTicketAttachments,
  type TicketAttachmentRecord,
  type TicketMessageRecord,
} from "@/lib/relay-ticketing";
import { sanitizeUserFacingError } from "@/lib/security";
import { activeTicketStatuses } from "@/lib/statuses";
import { getSupabaseClient } from "@/lib/supabase";
import {
  compareTicketChatThreads,
  getTicketChatSenderRole,
  getTicketChatUnreadCount,
  isTicketChatRelevantToUser,
  shouldShowGlobalTicketChat,
  type TicketChatScope,
} from "@/lib/ticket-chat";

type ChatTicket = {
  id: string;
  user_id: string | null;
  visible_to_user_id?: string | null;
  requester_name: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  assigned_to: string | null;
  updated_at: string | null;
};

type ChatThread = {
  ticket: ChatTicket;
  lastMessage: TicketMessageRecord | null;
  unreadCount: number;
};

type ChatReadRow = {
  ticket_id: string;
  last_read_at: string;
};

const CHAT_NOTIFICATION_TYPES = new Set(["requester_message", "operator_message"]);
const THREAD_REFRESH_INTERVAL_MS = 30_000;

export function GlobalTicketChat() {
  const pathname = usePathname();
  const activeTicketIdRef = useRef<string | null>(null);
  const relevantTicketIdsRef = useRef<Set<string>>(new Set());
  const openThreadRef = useRef<(ticketId: string) => Promise<void>>(async () => undefined);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [scope, setScope] = useState<TicketChatScope>("mine");
  const [searchQuery, setSearchQuery] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [ticket, setTicket] = useState<ChatTicket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewAll, setCanViewAll] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [realtimeDegraded, setRealtimeDegraded] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState<RelayNotificationRecord[]>([]);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    activeTicketIdRef.current = ticket?.id ?? null;
  }, [ticket?.id]);

  useEffect(() => {
    relevantTicketIdsRef.current = new Set(threads.map((thread) => thread.ticket.id));
  }, [threads]);

  const loadConversation = useCallback(
    async (ticketId: string, userId: string, userName: string | null, adminUser: boolean) => {
      const supabase = getSupabaseClient();

      if (!supabase) {
        return;
      }

      const [{ data: ticketData, error: ticketError }, messageData, attachmentData] =
        await Promise.all([
          supabase
            .from("tickets")
            .select(
              "id, user_id, visible_to_user_id, requester_name, job_number, request_summary, request_details, status, assigned_to, updated_at",
            )
            .eq("id", ticketId)
            .maybeSingle(),
          fetchTicketMessages(supabase, ticketId),
          fetchTicketAttachments(supabase, ticketId),
        ]);

      if (ticketError) {
        throw new Error(ticketError.message);
      }

      if (!ticketData) {
        return;
      }

      const typedTicket = ticketData as ChatTicket;
      const senderNames = await fetchProfileDisplayNamesByUserId(
        supabase,
        messageData
          .map((message) => message.sender_user_id)
          .filter((senderId): senderId is string => Boolean(senderId)),
      );

      setTicket(typedTicket);
      setMessages(
        mapGlobalChatMessages({
          messages: messageData,
          attachments: attachmentData,
          ticket: typedTicket,
          currentUserId: userId,
          currentUserName: userName,
          senderNames,
          adminUser,
        }),
      );
    },
    [],
  );

  const refreshThreads = useCallback(async (options?: { silent?: boolean }) => {
    const supabase = getSupabaseClient();

    if (!supabase || !currentUserId) {
      return;
    }

    if (!options?.silent) {
      setIsLoading(true);
    }
    try {
      let ticketQuery = supabase
        .from("tickets")
        .select(
          "id, user_id, visible_to_user_id, requester_name, job_number, request_summary, request_details, status, assigned_to, updated_at",
        )
        .in("status", [...activeTicketStatuses])
        .order("updated_at", { ascending: false })
        .limit(250);

      if (!isAdmin) {
        ticketQuery = ticketQuery.or(
          `user_id.eq.${currentUserId},visible_to_user_id.eq.${currentUserId}`,
        );
      }

      const { data: ticketData, error: ticketError } = await ticketQuery;

      if (ticketError) {
        throw new Error(ticketError.message);
      }

      const relevantTickets = ((ticketData ?? []) as ChatTicket[]).filter((candidate) =>
        isTicketChatRelevantToUser(candidate, {
          userId: currentUserId,
          operatorName: currentUserName,
          isAdmin,
          canViewAll,
          scope,
        }),
      );
      const ticketIds = relevantTickets.map((candidate) => candidate.id);
      const unread = (await fetchUnreadNotifications(supabase, currentUserId)).filter(
        (notification) =>
          CHAT_NOTIFICATION_TYPES.has(notification.type) && Boolean(notification.ticket_id),
      );

      if (ticketIds.length === 0) {
        setThreads([]);
        setUnreadNotifications(unread);
        if (activeTicketIdRef.current) {
          setTicket(null);
          setMessages([]);
        }
        return;
      }

      const [{ data: messageData, error: messageError }, { data: readData, error: readError }] =
        await Promise.all([
          supabase
            .from("ticket_messages")
            .select(
              "id, ticket_id, sender_user_id, sender_role, message_text, attachment_url, attachment_type, is_ai_message, created_at",
            )
            .in("ticket_id", ticketIds)
            .order("created_at", { ascending: true }),
          supabase
            .from("ticket_chat_reads")
            .select("ticket_id, last_read_at")
            .eq("user_id", currentUserId)
            .in("ticket_id", ticketIds),
        ]);

      if (messageError) {
        throw new Error(messageError.message);
      }

      if (readError) {
        throw new Error(readError.message);
      }

      const typedMessages = (messageData ?? []) as TicketMessageRecord[];
      const messagesByTicket = typedMessages.reduce<Map<string, TicketMessageRecord[]>>(
        (grouped, message) => {
          const current = grouped.get(message.ticket_id) ?? [];
          current.push(message);
          grouped.set(message.ticket_id, current);
          return grouped;
        },
        new Map(),
      );
      const readsByTicket = new Map(
        ((readData ?? []) as ChatReadRow[]).map((read) => [read.ticket_id, read.last_read_at]),
      );
      const notificationsByTicket = unread.reduce<Map<string, number>>((counts, notification) => {
        if (notification.ticket_id) {
          counts.set(notification.ticket_id, (counts.get(notification.ticket_id) ?? 0) + 1);
        }
        return counts;
      }, new Map());

      const nextThreads = relevantTickets
        .map<ChatThread>((candidate) => {
          const candidateMessages = messagesByTicket.get(candidate.id) ?? [];
          return {
            ticket: candidate,
            lastMessage: candidateMessages.at(-1) ?? null,
            unreadCount: getTicketChatUnreadCount({
              messages: candidateMessages,
              currentUserId,
              lastReadAt: readsByTicket.get(candidate.id) ?? null,
              notificationCount: notificationsByTicket.get(candidate.id) ?? 0,
            }),
          };
        })
        .sort((left, right) =>
          compareTicketChatThreads(
            {
              ticket: left.ticket,
              unreadCount: left.unreadCount,
              lastMessageAt: left.lastMessage?.created_at ?? null,
            },
            {
              ticket: right.ticket,
              unreadCount: right.unreadCount,
              lastMessageAt: right.lastMessage?.created_at ?? null,
            },
          ),
        );

      setThreads(nextThreads);
      setUnreadNotifications(unread);

      const activeTicketId = activeTicketIdRef.current;
      if (activeTicketId && !nextThreads.some((thread) => thread.ticket.id === activeTicketId)) {
        setTicket(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to refresh RELAY message inbox", error);
      setNotice({
        type: "error",
        message: sanitizeUserFacingError(error, "Unable to refresh messages."),
      });
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [canViewAll, currentUserId, currentUserName, isAdmin, scope]);

  const markConversationRead = useCallback(
    async (ticketId: string) => {
      const supabase = getSupabaseClient();

      if (!supabase || !currentUserId) {
        return;
      }

      const readAt = new Date().toISOString();
      const notificationIds = unreadNotifications
        .filter((notification) => notification.ticket_id === ticketId)
        .map((notification) => notification.id);

      const { error: readError } = await supabase.from("ticket_chat_reads").upsert(
        {
          user_id: currentUserId,
          ticket_id: ticketId,
          last_read_at: readAt,
        },
        { onConflict: "user_id,ticket_id" },
      );

      if (readError) {
        throw new Error(readError.message);
      }

      await markNotificationsRead(supabase, notificationIds);
      setUnreadNotifications((current) =>
        current.filter((notification) => !notificationIds.includes(notification.id)),
      );
      setThreads((current) =>
        current.map((thread) =>
          thread.ticket.id === ticketId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );
    },
    [currentUserId, unreadNotifications],
  );

  const openThread = useCallback(
    async (ticketId: string) => {
      if (!currentUserId) {
        return;
      }

      setNotice(null);
      await loadConversation(ticketId, currentUserId, currentUserName, isAdmin);
      await markConversationRead(ticketId);
    },
    [currentUserId, currentUserName, isAdmin, loadConversation, markConversationRead],
  );

  useEffect(() => {
    openThreadRef.current = openThread;
  }, [openThread]);

  useEffect(() => {
    if (!shouldShowGlobalTicketChat(pathname)) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    void getCurrentUserWithRole(supabase)
      .then(async (session) => {
        if (!isMounted || !session.user) {
          setIsLoading(false);
          return;
        }

        const userName =
          session.profile?.display_name?.trim() || session.user.email?.split("@")[0] || null;
        const { data: oversightAccess } = session.isAdmin
          ? await supabase
              .from("oversight_access")
              .select("enabled")
              .eq("user_id", session.user.id)
              .eq("enabled", true)
              .maybeSingle()
          : { data: null };

        if (!isMounted) {
          return;
        }

        setCurrentUserId(session.user.id);
        setCurrentUserName(userName);
        setIsAdmin(session.isAdmin);
        setCanViewAll(Boolean(oversightAccess));
        setScope("mine");
      })
      .catch((error) => {
        console.error("Failed to initialise RELAY messages", error);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [pathname]);

  useEffect(() => {
    if (!currentUserId || !shouldShowGlobalTicketChat(pathname)) {
      return;
    }
    void refreshThreads();
  }, [currentUserId, pathname, refreshThreads]);

  useEffect(() => {
    if (!currentUserId || !shouldShowGlobalTicketChat(pathname)) {
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    const scheduleRefresh = (ticketId?: string | null) => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        void refreshThreads({ silent: true });
        if (ticketId && ticketId === activeTicketIdRef.current) {
          void loadConversation(ticketId, currentUserId, currentUserName, isAdmin);
        }
      }, 250);
    };

    const channel = supabase
      .channel(`relay-global-messages-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_messages" },
        (payload) => {
          const record = (payload.new ?? payload.old) as Partial<TicketMessageRecord>;
          scheduleRefresh(record.ticket_id);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_attachments" },
        (payload) => {
          const record = (payload.new ?? payload.old) as Partial<TicketAttachmentRecord>;
          if (record.attachment_context === "chat") {
            scheduleRefresh(record.ticket_id);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tickets" },
        (payload) => {
          const record = (payload.new ?? payload.old) as Partial<ChatTicket>;
          scheduleRefresh(record.id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${currentUserId}`,
        },
        () => scheduleRefresh(),
      )
      .on("broadcast", { event: "refresh" }, () => scheduleRefresh())
      .subscribe((status) => {
        setRealtimeDegraded(status === "CHANNEL_ERROR" || status === "TIMED_OUT");
        if (status === "SUBSCRIBED") {
          scheduleRefresh();
        }
      });

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshThreads({ silent: true });
      }
    }, THREAD_REFRESH_INTERVAL_MS);

    function handleTicketSelection(event: Event) {
      const ticketId = (event as CustomEvent<{ ticketId?: string }>).detail?.ticketId;
      if (!ticketId || !relevantTicketIdsRef.current.has(ticketId)) {
        return;
      }
      setIsOpen(true);
      void openThreadRef.current(ticketId);
    }

    window.addEventListener("relay:ticket-selected", handleTicketSelection);

    return () => {
      window.clearInterval(pollId);
      window.removeEventListener("relay:ticket-selected", handleTicketSelection);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, currentUserName, isAdmin, loadConversation, pathname, refreshThreads]);

  const handleSendMessage = useCallback(
    async ({ messageText, files }: { messageText: string; files: File[] }) => {
      const supabase = getSupabaseClient();

      if (!supabase || !ticket || !currentUserId) {
        setNotice({ type: "error", message: "Unable to send this message right now." });
        return false;
      }

      setIsSending(true);
      setNotice(null);

      try {
        const uploadedAttachments =
          files.length > 0
            ? await uploadTicketAttachments({
                supabase,
                ticketId: ticket.id,
                userId: currentUserId,
                files,
                attachmentKind: "chat",
              })
            : [];

        await createTicketMessage({
          supabase,
          ticketId: ticket.id,
          senderUserId: currentUserId,
          senderRole: getTicketChatSenderRole(isAdmin),
          messageText,
          attachments: uploadedAttachments,
        });

        if (isAdmin) {
          void notifyRequesterOfOperatorMessage(supabase, {
            userId: ticket.user_id,
            ticketId: ticket.id,
            jobNumber: ticket.job_number,
            assignedTo: currentUserName || ticket.assigned_to,
            messageText,
          }).catch((error) => {
            console.error("Failed to notify requester about global chat reply", error);
          });
        } else {
          void notifyAdminsOfRequesterMessage(supabase, {
            ticketId: ticket.id,
            requesterName: ticket.requester_name,
            jobNumber: ticket.job_number,
            requestSummary: messageText || ticket.request_summary || ticket.request_details,
            assignedTo: ticket.assigned_to,
          }).catch((error) => {
            console.error("Failed to notify assigned operator about requester chat", error);
          });
        }

        await loadConversation(ticket.id, currentUserId, currentUserName, isAdmin);
        await markConversationRead(ticket.id);
        setNotice({ type: "success", message: "Message sent." });
        return true;
      } catch (error) {
        setNotice({
          type: "error",
          message: sanitizeUserFacingError(error, "Failed to send message."),
        });
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [currentUserId, currentUserName, isAdmin, loadConversation, markConversationRead, ticket],
  );

  const totalUnread = threads.reduce((total, thread) => total + thread.unreadCount, 0);
  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return threads;
    }

    return threads.filter(({ ticket: candidate, lastMessage }) =>
      [
        candidate.job_number,
        candidate.request_summary,
        candidate.request_details,
        candidate.requester_name,
        candidate.assigned_to,
        lastMessage?.message_text,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [searchQuery, threads]);

  if (!shouldShowGlobalTicketChat(pathname) || !currentUserId) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#101827] text-white shadow-[0_14px_36px_rgba(15,23,42,0.3)] transition hover:-translate-y-0.5 hover:bg-[#172235] focus:outline-none focus:ring-4 focus:ring-emerald-500/25 sm:bottom-4 sm:right-4 sm:h-14 sm:w-14"
        aria-label={`Open RELAY messages${totalUnread > 0 ? `, ${totalUnread} unread` : ""}`}
        title="Open RELAY messages"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-black text-white sm:h-9 sm:w-9 sm:text-base">
          R
        </span>
        {totalUnread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-black text-white shadow-sm">
            {totalUnread > 99 ? "99+" : totalUnread}
          </span>
        ) : (
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[#101827] bg-emerald-400" />
        )}
      </button>
    );
  }

  if (ticket) {
    return (
      <TicketChatPanel
        key={ticket.id}
        ticketId={ticket.id}
        ticketLabel={ticket.job_number}
        ticketStatus={ticket.status ?? "PENDING"}
        latestUpdate="Messages stay attached to this job."
        assignedTo={ticket.assigned_to}
        messages={messages}
        mode={isAdmin ? "operator" : "requester"}
        isSending={isSending}
        notice={notice}
        onSendMessage={handleSendMessage}
        unreadCount={0}
        open
        onOpenChange={(nextOpen) => setIsOpen(nextOpen)}
        onBack={() => {
          setTicket(null);
          setMessages([]);
          setNotice(null);
        }}
      />
    );
  }

  return (
    <aside
      className="fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-2 z-[90] flex h-[min(42rem,calc(100dvh-1rem))] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.3)] sm:bottom-4 sm:right-4 sm:h-[min(42rem,calc(100dvh-2rem))] sm:w-[min(27rem,calc(100vw-2rem))] sm:rounded-[1.5rem]"
      aria-label="RELAY messages inbox"
    >
      <header className="shrink-0 bg-[#101827] px-4 pb-4 pt-4 text-white sm:px-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              RELAY messages
            </p>
            <h2 className="mt-1 text-xl font-black">{isAdmin ? "Your job conversations" : "Your requests"}</h2>
            <p className="mt-1 text-xs text-slate-300">
              {isAdmin ? "Only work assigned to you appears here." : "Messages for requests you can access."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Minimise messages"
          >
            −
          </button>
        </div>

        {isAdmin ? (
          <div className="mt-4 flex gap-1 rounded-xl bg-white/10 p-1" role="group" aria-label="Message scope">
            {([
              { value: "mine" as const, label: "My jobs" },
              { value: "queue" as const, label: "Stores queue" },
              ...(canViewAll ? [{ value: "all" as const, label: "All" }] : []),
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setScope(option.value);
                  setTicket(null);
                  setMessages([]);
                }}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold transition ${
                  scope === option.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
                aria-pressed={scope === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-white p-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search jobs, requesters or messages"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
          aria-label="Search conversations"
        />
        {realtimeDegraded ? (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Live connection interrupted. Messages refresh automatically every 30 seconds.
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3">
        {isLoading ? (
          <div className="space-y-2" aria-label="Loading messages">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex h-full items-center justify-center p-5 text-center">
            <div>
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-xl font-black text-emerald-700">
                R
              </span>
              <h3 className="mt-4 text-sm font-bold text-slate-800">No conversations here</h3>
              <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                {isAdmin && scope === "mine"
                  ? "Assigned jobs will appear here, including jobs with no messages yet."
                  : isAdmin && scope === "queue"
                    ? "Unassigned job conversations will appear in the Stores queue."
                    : "Your active requests will appear here so you can start a conversation."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredThreads.map((thread) => {
              const summary =
                thread.ticket.request_summary?.trim() ||
                thread.ticket.request_details?.trim() ||
                "Untitled request";
              const preview = thread.lastMessage?.message_text?.trim() || "Start a conversation";
              return (
                <button
                  key={thread.ticket.id}
                  type="button"
                  onClick={() => void openThread(thread.ticket.id)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                  aria-label={`Open messages for job ${thread.ticket.job_number?.trim() || thread.ticket.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">
                        Job {thread.ticket.job_number?.trim() || thread.ticket.id}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-slate-600">{summary}</p>
                    </div>
                    {thread.unreadCount > 0 ? (
                      <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">
                        {thread.unreadCount}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{preview}</p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <StatusBadge status={thread.ticket.status ?? "PENDING"} />
                    <span className="truncate text-[10px] font-semibold text-slate-400">
                      {thread.ticket.assigned_to?.trim() || "Stores queue"} · {formatThreadDate(thread.lastMessage?.created_at ?? thread.ticket.updated_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function mapGlobalChatMessages({
  messages,
  attachments,
  ticket,
  currentUserId,
  currentUserName,
  senderNames,
  adminUser,
}: {
  messages: TicketMessageRecord[];
  attachments: TicketAttachmentRecord[];
  ticket: ChatTicket;
  currentUserId: string;
  currentUserName: string | null;
  senderNames: Record<string, string>;
  adminUser: boolean;
}): ChatMessage[] {
  return messages.map((message) => {
    const attachment = attachments.find((candidate) => candidate.message_id === message.id);
    const isCurrentUser = message.sender_user_id === currentUserId;
    const normalizedRole = message.sender_role === "parts" ? "operator" : message.sender_role;
    let senderName = senderNames[message.sender_user_id ?? ""];

    if (!senderName && isCurrentUser) {
      senderName = currentUserName || (adminUser ? "Administrator" : "Requester");
    }

    if (!senderName && normalizedRole === "requester") {
      senderName = ticket.requester_name || "Requester";
    }

    if (!senderName && normalizedRole === "ai") {
      senderName = "RELAY Local Assistant";
    }

    return {
      id: message.id,
      senderName: senderName || ticket.assigned_to || "Stores Operator",
      senderRole: normalizedRole,
      messageText: message.message_text ?? undefined,
      attachmentUrl: attachment?.signed_url ?? undefined,
      attachmentName: attachment?.file_name ?? undefined,
      createdAt: message.created_at ?? new Date().toISOString(),
      isAiMessage: message.is_ai_message ?? false,
    };
  });
}

function formatThreadDate(value: string | null | undefined) {
  if (!value) {
    return "No activity";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
