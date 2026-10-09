import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";
import type { SupportTicketStatus } from "@/lib/support-tickets";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: "Support tickets are not configured." }, { status: 503 });
    const user = await getRelaySessionUserFromRequest(request);
    if (!user?.id) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: request.headers.get("authorization") ?? "" } } });
    const body = await request.json().catch(() => ({})) as { status?: SupportTicketStatus };
    if (!body.status || !["OPEN", "IN_PROGRESS", "RESOLVED"].includes(body.status)) {
      return NextResponse.json({ error: "Choose a valid ticket status." }, { status: 400 });
    }
    const { id } = await context.params;
    const resolved = body.status === "RESOLVED";
    const { data, error } = await supabase.from("support_tickets").update({
      status: body.status, updated_at: new Date().toISOString(), resolved_at: resolved ? new Date().toISOString() : null, resolved_by: resolved ? user.id : null,
    }).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ticket: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the ticket." }, { status: 400 });
  }
}
