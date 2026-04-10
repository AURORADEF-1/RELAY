import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";
import type { RelayNotificationType } from "@/lib/notifications";

type NotificationInsertPayload = {
  user_id: string;
  ticket_id: string | null;
  type: RelayNotificationType;
  title: string;
  body: string;
};

const allowedNotificationTypes = new Set<RelayNotificationType>([
  "new_ticket",
  "status_update",
  "requester_message",
  "operator_message",
  "task_assigned",
  "ready_reminder",
  "ready_for_collection",
  "part_collected",
  "part_returned",
]);

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey };
}

function deriveAdminFromUser(user: { email?: string | null }, role: string | null) {
  const normalizedRole = role?.trim().toLowerCase() ?? "";

  if (normalizedRole === "admin") {
    return true;
  }

  const email = (user.email ?? "").trim().toLowerCase();
  const emailLocalPart = email.split("@")[0] || "";

  return email === "admin@mlp.local" || emailLocalPart.endsWith(".admin");
}

function isValidNotificationPayload(value: unknown): value is NotificationInsertPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.user_id === "string" &&
    (record.ticket_id === null || typeof record.ticket_id === "string") &&
    typeof record.type === "string" &&
    allowedNotificationTypes.has(record.type as RelayNotificationType) &&
    typeof record.title === "string" &&
    typeof record.body === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    const config = getSupabaseConfig();

    if (!config) {
      return NextResponse.json(
        { error: "Supabase notification dispatch is not configured." },
        { status: 500 },
      );
    }

    const user = await getRelaySessionUserFromRequest(request);

    if (!user?.id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      notifications?: unknown;
    };
    const notifications = Array.isArray(body.notifications)
      ? body.notifications.filter(isValidNotificationPayload)
      : [];

    if (notifications.length === 0) {
      return NextResponse.json({ error: "No notifications were supplied." }, { status: 400 });
    }

    const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const [{ data: senderProfile, error: senderProfileError }, { data: adminProfiles, error: adminProfilesError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle<{ role?: string | null }>(),
        supabase
          .from("profiles")
          .select("id")
          .eq("role", "admin"),
      ]);

    if (senderProfileError) {
      throw new Error(senderProfileError.message);
    }

    if (adminProfilesError) {
      throw new Error(adminProfilesError.message);
    }

    const isAdmin = deriveAdminFromUser(
      user,
      typeof senderProfile?.role === "string" ? senderProfile.role : null,
    );
    const adminUserIds = new Set(
      (adminProfiles ?? [])
        .map((profile) => profile.id)
        .filter((id): id is string => typeof id === "string"),
    );

    const isAllowed = notifications.every((notification) => {
      if (isAdmin) {
        return true;
      }

      return notification.user_id === user.id || adminUserIds.has(notification.user_id);
    });

    if (!isAllowed) {
      return NextResponse.json(
        { error: "You do not have permission to dispatch those notifications." },
        { status: 403 },
      );
    }

    const { error } = await supabase.from("notifications").insert(notifications);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Notification dispatch failed.",
      },
      { status: 500 },
    );
  }
}
