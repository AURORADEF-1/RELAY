import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";

export async function PATCH(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return NextResponse.json({ error: "User email management is not configured." }, { status: 503 });
    const actor = await getRelaySessionUserFromRequest(request);
    if (!actor?.id) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: request.headers.get("authorization") ?? "" } } });
    const { data: actorProfile } = await supabase.from("profiles").select("role").eq("id", actor.id).maybeSingle();
    if (actorProfile?.role !== "admin") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { userId?: string; email?: string; fullName?: string; role?: string; interfaceMode?: string };
    const email = body.email?.trim().toLowerCase() || null;
    const fullName = body.fullName?.trim() || null;
    const role = body.role?.trim().toLowerCase();
    const interfaceMode = body.interfaceMode?.trim().toLowerCase();
    if (!body.userId) return NextResponse.json({ error: "Choose a user account." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!role || !["admin", "requester", "customer", "user"].includes(role)) return NextResponse.json({ error: "Choose a valid account role." }, { status: 400 });
    if (!interfaceMode || !["standard", "front_counter"].includes(interfaceMode)) return NextResponse.json({ error: "Choose a valid interface mode." }, { status: 400 });
    const { error } = await supabase.rpc("admin_update_user_account", {
      p_user_id: body.userId, p_full_name: fullName, p_email: email, p_role: role, p_interface_mode: interfaceMode,
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, email, fullName, role, interfaceMode });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the email." }, { status: 400 });
  }
}
