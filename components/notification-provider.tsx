"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type {
  AuthChangeEvent,
  Session,
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  SupabaseClient,
} from "@supabase/supabase-js";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type NotificationContextValue = {
  requesterUnreadCount: number;
  adminBadgeCount: number;
  isAdmin: boolean;
  isAuthenticated: boolean;
};

const NotificationContext = createContext<NotificationContextValue>({
  requesterUnreadCount: 0,
  adminBadgeCount: 0,
  isAdmin: false,
  isAuthenticated: false,
});

const REQUESTER_UNREAD_KEY = "relay-requester-unread-count";
const ADMIN_UNREAD_KEY = "relay-admin-unread-count";
const SOUND_COOLDOWN_MS = 1800;

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const requesterTicketIdsRef = useRef<Set<string>>(new Set());
  const handledEventsRef = useRef<Set<string>>(new Set());
  const lastSoundAtRef = useRef(0);
  const [requesterUnreadCount, setRequesterUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [pendingTicketCount, setPendingTicketCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    pathnameRef.current = pathname;

    if (pathname === "/requests" || pathname.startsWith("/tickets/")) {
      setRequesterUnreadCount(0);
    }

    if (pathname === "/admin") {
      setAdminUnreadCount(0);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedRequester = Number(window.sessionStorage.getItem(REQUESTER_UNREAD_KEY));
    const savedAdmin = Number(window.sessionStorage.getItem(ADMIN_UNREAD_KEY));

    if (Number.isFinite(savedRequester) && savedRequester > 0) {
      setRequesterUnreadCount(savedRequester);
    }

    if (Number.isFinite(savedAdmin) && savedAdmin > 0) {
      setAdminUnreadCount(savedAdmin);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        REQUESTER_UNREAD_KEY,
        String(requesterUnreadCount),
      );
    }
  }, [requesterUnreadCount]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(ADMIN_UNREAD_KEY, String(adminUnreadCount));
    }
  }, [adminUnreadCount]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const supabaseClient = supabase;

    let isMounted = true;
    let activeChannel: RealtimeChannel | null = null;
    let authUnsubscribe: (() => void) | null = null;

    async function clearNotificationState() {
      requesterTicketIdsRef.current = new Set();
      setIsAdmin(false);
      setIsAuthenticated(false);
      setPendingTicketCount(0);
      setRequesterUnreadCount(0);
      setAdminUnreadCount(0);

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(REQUESTER_UNREAD_KEY);
        window.sessionStorage.removeItem(ADMIN_UNREAD_KEY);
      }

      if (activeChannel) {
        await supabaseClient.removeChannel(activeChannel);
        activeChannel = null;
      }
    }

    async function setupNotifications() {
      try {
        if (activeChannel) {
          await supabaseClient.removeChannel(activeChannel);
          activeChannel = null;
        }

        const { user, isAdmin: adminUser } = await getCurrentUserWithRole(
          supabaseClient,
        );

        if (!isMounted) {
          return;
        }

        if (!user) {
          await clearNotificationState();
          return;
        }

        setIsAdmin(adminUser);
        setIsAuthenticated(true);

        if (adminUser) {
          await refreshPendingTicketCount(supabaseClient, setPendingTicketCount);
        } else {
          const { data, error } = await supabaseClient
            .from("tickets")
            .select("id")
            .eq("user_id", user.id);

          if (error) {
            throw error;
          }

          requesterTicketIdsRef.current = new Set(
            (data ?? [])
              .map((ticket) => ticket.id)
              .filter((ticketId): ticketId is string => typeof ticketId === "string"),
          );
        }

        // Realtime notification subscriptions for ticket and chat activity.
        const channel = supabaseClient.channel(
          `relay-notifications-${user.id}-${adminUser ? "admin" : "requester"}`,
        );
        activeChannel = channel;

        if (adminUser) {
          channel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "tickets" },
            async (payload) => {
              if (!markRealtimeEventHandled(payload)) {
                return;
              }

              if (payload.new.status === "PENDING") {
                if (pathnameRef.current !== "/admin") {
                  setAdminUnreadCount((current) => current + 1);
                  playNotificationSound();
                }
              }

              void refreshPendingTicketCount(
                supabaseClient,
                setPendingTicketCount,
              ).catch((error) => {
                console.error("Failed to refresh pending ticket count", error);
              });
            },
          );

          channel.on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "tickets" },
            () => {
              void refreshPendingTicketCount(
                supabaseClient,
                setPendingTicketCount,
              ).catch((error) => {
                console.error("Failed to refresh pending ticket count", error);
              });
            },
          );

          channel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "ticket_messages" },
            (payload) => {
              if (!markRealtimeEventHandled(payload)) {
                return;
              }

              if (
                payload.new.sender_role === "requester" &&
                pathnameRef.current !== "/admin"
              ) {
                setAdminUnreadCount((current) => current + 1);
                playNotificationSound();
              }
            },
          );
        } else {
          channel.on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "tickets",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (typeof payload.new.id === "string") {
                requesterTicketIdsRef.current.add(payload.new.id);
              }
            },
          );

          channel.on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "tickets",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (!markRealtimeEventHandled(payload)) {
                return;
              }

              const ticketId =
                typeof payload.new.id === "string" ? payload.new.id : undefined;

              if (ticketId) {
                requesterTicketIdsRef.current.add(ticketId);
              }

              const oldStatus = readStringField(payload.old, "status");
              const newStatus = readStringField(payload.new, "status");

              if (!newStatus || oldStatus === newStatus) {
                return;
              }

              if (isRequesterNotificationPage(ticketId)) {
                return;
              }

              setRequesterUnreadCount((current) => current + 1);
              playNotificationSound();
            },
          );

          channel.on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "ticket_messages" },
            (payload) => {
              if (!markRealtimeEventHandled(payload)) {
                return;
              }

              const ticketId = readStringField(payload.new, "ticket_id");
              const senderUserId = readStringField(payload.new, "sender_user_id");

              if (!ticketId || !requesterTicketIdsRef.current.has(ticketId)) {
                return;
              }

              if (senderUserId === user.id || isRequesterNotificationPage(ticketId)) {
                return;
              }

              setRequesterUnreadCount((current) => current + 1);
              playNotificationSound();
            },
          );
        }

        channel.subscribe();
      } catch (error) {
        console.error("Failed to initialise realtime notifications", error);
      }
    }

    setupNotifications();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) {
          return;
        }

        if (!session) {
          void clearNotificationState();
          return;
        }

        void setupNotifications();
      },
    );
    authUnsubscribe = () => subscription.unsubscribe();

    return () => {
      isMounted = false;
      authUnsubscribe?.();
      if (activeChannel) {
        void supabaseClient.removeChannel(activeChannel);
      }
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      requesterUnreadCount,
      adminBadgeCount: adminUnreadCount > 0 ? adminUnreadCount : pendingTicketCount,
      isAdmin,
      isAuthenticated,
    }),
    [adminUnreadCount, isAdmin, isAuthenticated, pendingTicketCount, requesterUnreadCount],
  );

  function isRequesterNotificationPage(ticketId?: string) {
    return (
      pathnameRef.current === "/requests" ||
      (ticketId ? pathnameRef.current === `/tickets/${ticketId}` : false)
    );
  }

  function markRealtimeEventHandled(
    payload:
      | RealtimePostgresInsertPayload<Record<string, unknown>>
      | RealtimePostgresUpdatePayload<Record<string, unknown>>,
  ) {
    const recordId =
      readStringField(payload.new, "id") ??
      readStringField(payload.new, "ticket_id") ??
      "unknown";
    const eventKey = [
      payload.table,
      payload.eventType,
      recordId,
      payload.commit_timestamp ?? "",
    ].join(":");

    if (handledEventsRef.current.has(eventKey)) {
      return false;
    }

    handledEventsRef.current.add(eventKey);

    if (handledEventsRef.current.size > 200) {
      const firstKey = handledEventsRef.current.values().next().value;

      if (firstKey) {
        handledEventsRef.current.delete(firstKey);
      }
    }

    return true;
  }

  function playNotificationSound() {
    const now = Date.now();

    if (now - lastSoundAtRef.current < SOUND_COOLDOWN_MS) {
      return;
    }

    lastSoundAtRef.current = now;
    const audio = new Audio("/notification.aiff");
    void audio.play().catch(() => {});
  }

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}

async function refreshPendingTicketCount(
  supabase: SupabaseClient,
  setPendingTicketCount: (value: number) => void,
) {
  const { count, error } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  if (error) {
    throw error;
  }

  setPendingTicketCount(count ?? 0);
}

function readStringField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
