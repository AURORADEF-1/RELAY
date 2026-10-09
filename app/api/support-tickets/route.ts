import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizeSupportTicketDraft } from "@/lib/support-tickets";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export async function POST(request: NextRequest) {
  try {
    const settings = config();
    if (!settings) return NextResponse.json({ error: "Support tickets are not configured." }, { status: 503 });

    const raw = await request.json().catch(() => ({}));
    if (raw && typeof raw === "object" && "website" in raw && raw.website) {
      return NextResponse.json({ ok: true });
    }
    const draft = normalizeSupportTicketDraft(raw);
    const authorization = request.headers.get("authorization") ?? "";
    const supabase = createClient(settings.url, settings.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
    });
    const { data, error } = await supabase.rpc("submit_support_ticket", {
      p_subject: draft.subject, p_description: draft.description,
      p_requester_name: draft.requesterName, p_requester_email: draft.requesterEmail,
    });
    if (error) throw new Error(error.message);
    const result = (Array.isArray(data) ? data[0] : data) as { id: string; reference: string };
    const emailSent = false;
    return NextResponse.json({ ok: true, ticketId: result.id, reference: result.reference, emailSent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create the support ticket." }, { status: 400 });
  }
}
