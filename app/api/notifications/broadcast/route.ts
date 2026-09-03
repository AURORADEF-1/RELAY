import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";
import {
  normalizeRelayBroadcastDraft,
  RELAY_SYSTEM_BROADCAST_CHANNEL,
  type RelayBroadcastDraft,
} from "@/lib/system-broadcast";

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey };
}

function isAdminIdentity(role: string | null) {
  return role?.trim().toLowerCase() === "admin";
}

async function dispatchRealtimeRefresh(
  config: NonNullable<ReturnType<typeof getSupabaseConfig>>,
  kind: RelayBroadcastDraft["kind"],
) {
  const response = await fetch(
    `${config.supabaseUrl}/realtime/v1/api/broadcast/${encodeURIComponent(RELAY_SYSTEM_BROADCAST_CHANNEL)}/events/refresh`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey ?? config.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind, sentAt: new Date().toISOString() }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    console.error("Unable to dispatch RELAY broadcast refresh", response.status);
  }

  return response.ok;
}

export async function POST(request: NextRequest) {
  try {
    const config = getSupabaseConfig();
    if (!config) {
      return NextResponse.json(
        { error: "RELAY broadcast notifications are not configured." },
        { status: 500 },
      );
    }

    const user = await getRelaySessionUserFromRequest(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const authorizationHeader = request.headers.get("authorization") ?? "";
    const supabase = createClient(
      config.supabaseUrl,
      config.serviceRoleKey ?? config.supabaseAnonKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(config.serviceRoleKey
          ? {}
          : {
              global: {
                headers: {
                  Authorization: authorizationHeader,
                },
              },
            }),
      },
    );
    const { data: senderProfile, error: senderProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role?: string | null }>();

    if (senderProfileError) throw new Error(senderProfileError.message);
    if (!isAdminIdentity(senderProfile?.role ?? null)) {
      return NextResponse.json(
        { error: "Administrator access is required." },
        { status: 403 },
      );
    }

    const draft = normalizeRelayBroadcastDraft(
      (await request.json().catch(() => ({}))) as RelayBroadcastDraft,
    );
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .not("id", "is", null);

    if (profilesError) throw new Error(profilesError.message);

    const recipientIds = Array.from(
      new Set(
        (profiles ?? [])
          .map((profile) => profile.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );

    if (!recipientIds.includes(user.id)) recipientIds.push(user.id);

    const { error: insertError } = await supabase.from("notifications").insert(
      recipientIds.map((userId) => ({
        user_id: userId,
        ticket_id: null,
        type: "system_broadcast",
        title: draft.title,
        body: draft.message,
      })),
    );

    if (insertError) throw new Error(insertError.message);

    const realtimeDispatched = await dispatchRealtimeRefresh(config, draft.kind);

    return NextResponse.json({
      ok: true,
      recipients: recipientIds.length,
      realtimeDispatched,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send the announcement." },
      { status: 500 },
    );
  }
}
