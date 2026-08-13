import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getRelaySessionUserFromRequest,
  requestCanAccessTicket,
} from "@/lib/security";

function toNexusStatus(status: string | null) {
  if (status === "COMPLETED") return "completed";
  if (status === "READY") return "ready";
  return "processing";
}

export async function POST(request: NextRequest) {
  const user = await getRelaySessionUserFromRequest(request);
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication is required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ticketId = String(body.ticketId ?? "").trim();
    if (!ticketId || !(await requestCanAccessTicket(request, ticketId))) {
      return NextResponse.json({ error: "Ticket access is required" }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const nexusStatusUrl = process.env.NEXUS_ORDER_STATUS_URL;
    const sharedKey = process.env.NEXUS_RELAY_ORDER_KEY;
    if (!supabaseUrl || !serviceRoleKey || !nexusStatusUrl || !sharedKey) {
      return NextResponse.json({ error: "NEXUS status sync is not configured" }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id,status,is_retail_sale,nexus_order_id")
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket?.is_retail_sale || !ticket.nexus_order_id) {
      return NextResponse.json({ skipped: true, reason: "Not a NEXUS ecommerce ticket" });
    }

    const response = await fetch(nexusStatusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sharedKey}`,
      },
      body: JSON.stringify({
        nexusOrderId: ticket.nexus_order_id,
        relayTicketId: ticket.id,
        status: toNexusStatus(ticket.status),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    const now = new Date().toISOString();
    if (!response.ok) {
      const message = payload.error || `NEXUS rejected the status (${response.status})`;
      await supabase
        .from("tickets")
        .update({ nexus_status_sync_error: message.slice(0, 1000) })
        .eq("id", ticket.id);
      throw new Error(message);
    }

    await supabase
      .from("tickets")
      .update({ nexus_status_synced_at: now, nexus_status_sync_error: null })
      .eq("id", ticket.id);
    return NextResponse.json({ synced: true, status: toNexusStatus(ticket.status) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Status sync failed" },
      { status: 500 },
    );
  }
}
