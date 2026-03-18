"use client";

import {
  createContext,
  useCallback,
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
} from "@supabase/supabase-js";
import {
  ensureReadyReminderNotifications,
  fetchUnreadNotifications,
  markNotificationsRead,
} from "@/lib/notifications";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";
import {
  fetchUnreadTaskCount,
  getPresenceHeartbeatMs,
  upsertUserPresence,
} from "@/lib/user-tasks";

type NotificationContextValue = {
  requesterUnreadCount: number;
  adminBadgeCount: number;
  taskUnreadCount: number;
  isAdmin: boolean;
  isAuthenticated: boolean;
  toasts: NotificationToast[];
  dismissToast: (id: string) => Promise<void>;
};

type NotificationToast = {
  id: string;
  title: string;
  description: string;
  href?: string;
  tone?: "default" | "success";
  notificationId?: string;
  persistent?: boolean;
};

const NotificationContext = createContext<NotificationContextValue>({
  requesterUnreadCount: 0,
  adminBadgeCount: 0,
  taskUnreadCount: 0,
  isAdmin: false,
  isAuthenticated: false,
  toasts: [],
  dismissToast: async () => {},
});

const SOUND_COOLDOWN_MS = 1800;
const TOAST_DURATION_MS = 10000;
const NOTIFICATION_POLL_INTERVAL_MS = 15000;
const REQUEST_NOTIFICATION_TYPES = new Set([
  "status_update",
  "operator_message",
  "ready_reminder",
  "ready_for_collection",
]);

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const lastSoundAtRef = useRef(0);
  const knownUnreadIdsRef = useRef<Set<string>>(new Set());
  const [requesterUnreadCount, setRequesterUnreadCount] = useState(0);
  const [adminUnreadCount, setAdminUnreadCount] = useState(0);
  const [pendingTicketCount, setPendingTicketCount] = useState(0);
  const [taskUnreadCount, setTaskUnreadCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [toasts, setToasts] = useState<NotificationToast[]>([]);

  const dismissToast = useCallback(async (id: string) => {
    const toast = toasts.find((candidate) => candidate.id === id);

    if (toast?.notificationId) {
      const supabase = getSupabaseClient();

      if (supabase) {
        try {
          await markNotificationsRead(supabase, [toast.notificationId]);
          knownUnreadIdsRef.current.delete(toast.notificationId);
        } catch (error) {
          console.error("Failed to mark RELAY notification as read", error);
        }
      }
    }

    setToasts((current) => current.filter((toastItem) => toastItem.id !== id));
  }, [toasts]);

  const pushToast = useCallback((toast: Omit<NotificationToast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);

    if (!toast.persistent) {
      window.setTimeout(() => {
        setToasts((current) => current.filter((toastItem) => toastItem.id !== id));
      }, TOAST_DURATION_MS);
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    const now = Date.now();

    if (now - lastSoundAtRef.current < SOUND_COOLDOWN_MS) {
      return;
    }

    lastSoundAtRef.current = now;
    const audio = new Audio("/notification.aiff");
    void audio.play().catch(() => {});
  }, []);

  const refreshPendingTicketCount = useCallback(async () => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    const { count, error } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING");

    if (!error) {
      setPendingTicketCount(count ?? 0);
    }
  }, []);

  const syncUnreadNotifications = useCallback(
    async (
      supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
      userId: string,
      adminUser: boolean,
      options?: { showToasts: boolean },
    ) => {
      const unreadNotifications = await fetchUnreadNotifications(supabase, userId);
      const unreadTaskNotifications = unreadNotifications.filter(
        (notification) => notification.type === "task_assigned",
      );
      const unreadRequesterNotifications = unreadNotifications.filter(
        (notification) => REQUEST_NOTIFICATION_TYPES.has(notification.type),
      );
      const nextUnreadIds = new Set(unreadNotifications.map((notification) => notification.id));

      if (options?.showToasts) {
        const nextToasts = unreadNotifications
          .filter((notification) => !knownUnreadIdsRef.current.has(notification.id))
          .sort(
            (left, right) =>
              new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
          );

        for (const notification of nextToasts) {
          pushToast({
            title: notification.title,
            description: notification.body ?? "New RELAY activity.",
            href:
              notification.type === "task_assigned"
                ? "/tasks"
                : notification.ticket_id
                  ? `/tickets/${notification.ticket_id}`
                  : undefined,
            tone: "success",
            notificationId: notification.id,
            persistent:
              notification.type === "ready_reminder" ||
              notification.type === "ready_for_collection",
          });
          playNotificationSound();
        }
      }

      knownUnreadIdsRef.current = nextUnreadIds;

      if (adminUser) {
        setAdminUnreadCount(unreadNotifications.length);
      } else {
        setRequesterUnreadCount(unreadRequesterNotifications.length);
        try {
          const unreadTasks = await fetchUnreadTaskCount(supabase, userId);
          setTaskUnreadCount(Math.max(unreadTasks, unreadTaskNotifications.length));
        } catch (taskCountError) {
          console.error("Failed to load RELAY unread task count", taskCountError);
          setTaskUnreadCount(unreadTaskNotifications.length);
        }
      }
    },
    [playNotificationSound, pushToast],
  );

  const markPathNotificationsRead = useCallback(
    async (
      supabase: NonNullable<ReturnType<typeof getSupabaseClient>>,
      userId: string,
      adminUser: boolean,
      currentPath: string,
    ) => {
      const shouldMarkRead = adminUser
        ? currentPath === "/admin" ||
          currentPath === "/incidents" ||
          currentPath === "/incidents/closed" ||
          currentPath === "/control" ||
          currentPath === "/completed" ||
          currentPath.startsWith("/tickets/")
        : currentPath === "/requests" ||
          currentPath === "/tasks" ||
          currentPath.startsWith("/tickets/");

      if (!shouldMarkRead) {
        return;
      }

      const unreadNotifications = await fetchUnreadNotifications(supabase, userId);

      if (unreadNotifications.length === 0) {
        return;
      }

      const notificationsToMarkRead = adminUser
        ? unreadNotifications
        : currentPath === "/tasks"
          ? unreadNotifications.filter((notification) => notification.type === "task_assigned")
          : unreadNotifications.filter(
              (notification) =>
                REQUEST_NOTIFICATION_TYPES.has(notification.type) &&
                notification.type !== "ready_reminder" &&
                notification.type !== "ready_for_collection",
            );

      if (notificationsToMarkRead.length === 0) {
        return;
      }

      await markNotificationsRead(
        supabase,
        notificationsToMarkRead.map((notification) => notification.id),
      );

      knownUnreadIdsRef.current = new Set(
        unreadNotifications
          .filter(
            (notification) =>
              !notificationsToMarkRead.some((readNotification) => readNotification.id === notification.id),
          )
          .map((notification) => notification.id),
      );

      if (adminUser) {
        setAdminUnreadCount(0);
      } else {
        if (currentPath === "/tasks") {
          setTaskUnreadCount(0);
        } else {
          setRequesterUnreadCount(0);
        }
      }
    },
    [],
  );

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase) {
      return;
    }

    let isMounted = true;
    let activeChannel: RealtimeChannel | null = null;
    let pollInterval: number | null = null;
    let presenceInterval: number | null = null;

    const clearNotificationState = async () => {
      knownUnreadIdsRef.current = new Set();
      setRequesterUnreadCount(0);
      setAdminUnreadCount(0);
      setPendingTicketCount(0);
      setTaskUnreadCount(0);
      setIsAdmin(false);
      setIsAuthenticated(false);
      setToasts([]);

      if (activeChannel) {
        await supabase.removeChannel(activeChannel);
        activeChannel = null;
      }

      if (pollInterval) {
        window.clearInterval(pollInterval);
        pollInterval = null;
      }

      if (presenceInterval) {
        window.clearInterval(presenceInterval);
        presenceInterval = null;
      }
    };

    const setupNotifications = async () => {
      try {
        if (activeChannel) {
          await supabase.removeChannel(activeChannel);
          activeChannel = null;
        }

        if (pollInterval) {
          window.clearInterval(pollInterval);
          pollInterval = null;
        }

        const { user, profile, accessLevel, isAdmin: adminUser } =
          await getCurrentUserWithRole(supabase);

        if (!isMounted) {
          return;
        }

        if (!user) {
          await clearNotificationState();
          return;
        }

        console.log("RELAY access debug", {
          authEmail: user?.email,
          profileRole: profile?.role,
          profileUsername: profile?.username,
          profileDisplayName: profile?.display_name,
          computedAccess: accessLevel,
        });

        setIsAuthenticated(true);
        setIsAdmin(adminUser);
        if (!adminUser) {
          try {
            await ensureReadyReminderNotifications(supabase, user.id);
          } catch (reminderError) {
            console.error("Failed to ensure RELAY ready reminders", reminderError);
          }
        }
        try {
          await upsertUserPresence(supabase, user.id);
        } catch (presenceError) {
          console.error("Failed to update RELAY user presence", presenceError);
        }

        presenceInterval = window.setInterval(() => {
          void upsertUserPresence(supabase, user.id).catch((presenceError) => {
            console.error("Failed to update RELAY user presence", presenceError);
          });
        }, getPresenceHeartbeatMs());
        await syncUnreadNotifications(supabase, user.id, adminUser);

        if (adminUser) {
          await refreshPendingTicketCount();
        }

        await markPathNotificationsRead(
          supabase,
          user.id,
          adminUser,
          pathnameRef.current,
        );

        const channel = supabase.channel(`relay-notifications-${user.id}`);
        activeChannel = channel;

        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          async () => {
            await syncUnreadNotifications(supabase, user.id, adminUser, {
              showToasts: true,
            });

            if (adminUser) {
              await refreshPendingTicketCount();
            }
          },
        );

        channel.subscribe();

        pollInterval = window.setInterval(() => {
          void syncUnreadNotifications(supabase, user.id, adminUser, {
            showToasts: true,
          });

          if (adminUser) {
            void refreshPendingTicketCount();
          }
        }, NOTIFICATION_POLL_INTERVAL_MS);
      } catch (error) {
        console.error("Failed to initialise notifications", error);
      }
    };

    void setupNotifications();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();

      if (pollInterval) {
        window.clearInterval(pollInterval);
      }

      if (presenceInterval) {
        window.clearInterval(presenceInterval);
      }

      if (activeChannel) {
        void supabase.removeChannel(activeChannel);
      }
    };
  }, [
    markPathNotificationsRead,
    refreshPendingTicketCount,
    syncUnreadNotifications,
  ]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    if (!supabase || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    const syncReadState = async () => {
      const { user } = await getCurrentUserWithRole(supabase);

      if (!user || cancelled) {
        return;
      }

      await markPathNotificationsRead(supabase, user.id, isAdmin, pathname);
      await syncUnreadNotifications(supabase, user.id, isAdmin);
    };

    void syncReadState();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, isAuthenticated, markPathNotificationsRead, pathname, syncUnreadNotifications]);

  const contextValue = useMemo(
    () => ({
      requesterUnreadCount,
      adminBadgeCount: adminUnreadCount > 0 ? adminUnreadCount : pendingTicketCount,
      taskUnreadCount,
      isAdmin,
      isAuthenticated,
      toasts,
      dismissToast,
    }),
    [
      adminUnreadCount,
      dismissToast,
      isAdmin,
      isAuthenticated,
      pendingTicketCount,
      requesterUnreadCount,
      taskUnreadCount,
      toasts,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
