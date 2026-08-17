"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
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
import { getSupabaseClient } from "@/lib/supabase";
import {
  getTicketChatSenderRole,
  shouldShowGlobalTicketChat,
} from "@/lib/ticket-chat";

type ChatTicket = {
  id: string;
  user_id: string | null;
  requester_name: string | null;
  job_number: string | null;
  request_summary: string | null;
  request_details: string | null;
  status: string | null;
  assigned_to: string | null;
  updated_at: string | null;
};

const CHAT_NOTIFICATION_TYPES = new Set(["requester_message", "operator_message"]);

export function GlobalTicketChat() {
  const pathname = usePathname();
  const currentUserIdRef = useRef<string | null>(null);
  const currentUserNameRef = useRef<string | null>(null);
  const activeTicketIdRef = useRef<string | null>(null);
  const isAdminRef = useRef(false);
  const [ticket, setTicket] = useState<ChatTicket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState<RelayNotificationRecord[]>([]);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    activeTicketIdRef.current = ticket?.id ?? null;
  }, [ticket?.id]);

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
              "id, user_id, requester_name, job_number, request_summary, request_details, status, assigned_to, updated_at",
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

  useEffect(() => {
    if (!shouldShowGlobalTicketChat(pathname)) {
      return;
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const client = supabase;
    let isMounted = true;

    async function initialise() {
      const session = await getCurrentUserWithRole(client);

      if (!isMounted || !session.user) {
        return;
      }

      const userId = session.user.id;
      const userName =
        session.profile?.display_name?.trim() || session.user.email?.split("@")[0] || null;
      currentUserIdRef.current = userId;
      currentUserNameRef.current = userName;
      isAdminRef.current = session.isAdmin;
      setCurrentUserId(userId);
      setCurrentUserName(userName);
      setIsAdmin(session.isAdmin);

      const unread = (await fetchUnreadNotifications(client, userId)).filter(
        (notification) =>
          CHAT_NOTIFICATION_TYPES.has(notification.type) && Boolean(notification.ticket_id),
      );

      if (!isMounted) {
        return;
      }

      setUnreadNotifications(unread);
      setUnreadCount(unread.length);

      let nextTicketId = unread[0]?.ticket_id ?? null;

      if (!nextTicketId) {
        const { data: latestMessage, error } = await client
          .from("ticket_messages")
          .select("ticket_id")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        nextTicketId = latestMessage?.ticket_id ?? null;
      }

      if (nextTicketId && isMounted) {
        await loadConversation(nextTicketId, userId, userName, session.isAdmin);
      }
    }

    void initialise().catch((error) => {
      console.error("Failed to initialise global RELAY chat", error);
    });

    const channel = client
      .channel("relay-global-ticket-chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_messages" },
        (payload) => {
          const insertedMessage = payload.new as TicketMessageRecord;
          const userId = currentUserIdRef.current;

          if (!userId || insertedMessage.sender_user_id === userId) {
            return;
          }

          setUnreadCount((current) => current + 1);
          void loadConversation(
            insertedMessage.ticket_id,
            userId,
            currentUserNameRef.current,
            isAdminRef.current,
          ).catch((error) => {
            console.error("Failed to refresh global RELAY chat", error);
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_attachments" },
        (payload) => {
          const attachment = (payload.new ?? payload.old) as Partial<TicketAttachmentRecord>;
          const userId = currentUserIdRef.current;

          if (!userId || !attachment.ticket_id || attachment.attachment_context !== "chat") {
            return;
          }

          void loadConversation(
            attachment.ticket_id,
            userId,
            currentUserNameRef.current,
            isAdminRef.current,
          ).catch((error) => {
            console.error("Failed to refresh global RELAY chat photo", error);
          });
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      void client.removeChannel(channel);
    };
  }, [loadConversation, pathname]);

  const handleOpen = useCallback(async () => {
    setUnreadCount(0);
    const supabase = getSupabaseClient();
    const ticketId = activeTicketIdRef.current;
    const notificationIds = unreadNotifications
      .filter((notification) => notification.ticket_id === ticketId)
      .map((notification) => notification.id);

    if (!supabase || notificationIds.length === 0) {
      return;
    }

    try {
      await markNotificationsRead(supabase, notificationIds);
      setUnreadNotifications((current) =>
        current.filter((notification) => !notificationIds.includes(notification.id)),
      );
    } catch (error) {
      console.error("Failed to mark ticket chat notifications as read", error);
    }
  }, [unreadNotifications]);

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
          }).catch((error) => {
            console.error("Failed to notify admins about global requester chat", error);
          });
        }

        await loadConversation(ticket.id, currentUserId, currentUserName, isAdmin);
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
    [currentUserId, currentUserName, isAdmin, loadConversation, ticket],
  );

  if (!shouldShowGlobalTicketChat(pathname) || !ticket || !currentUserId) {
    return null;
  }

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
      unreadCount={unreadCount}
      onOpen={() => void handleOpen()}
    />
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
