import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { accessGroupIds } from "@/lib/access-groups";
import { getRelaySessionUserFromRequest } from "@/lib/security";

async function requireAdmin(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("User account management is not configured.");
  const actor = await getRelaySessionUserFromRequest(request);
  if (!actor?.id) return { error: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: request.headers.get("authorization") ?? "" } } });
  const { data: actorProfile } = await supabase.from("profiles").select("role").eq("id", actor.id).maybeSingle();
  if (actorProfile?.role !== "admin") return { error: NextResponse.json({ error: "Administrator access is required." }, { status: 403 }) };
  return { url, supabase };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireAdmin(request);
    if ("error" in access) return access.error;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return NextResponse.json({ error: "Last-login reporting is not configured." }, { status: 503 });

    const { data: profiles, error: profilesError } = await access.supabase
      .from("profiles")
      .select("id, full_name, role, email, interface_mode, access_group")
      .order("full_name");
    if (profilesError) throw new Error(profilesError.message);

    const adminClient = createClient(access.url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const lastSignInById = new Map<string, string | null>();
    let page = 1;
    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(error.message);
      data.users.forEach((user) => lastSignInById.set(user.id, user.last_sign_in_at ?? null));
      if (data.users.length < 1000) break;
      page += 1;
    }

    return NextResponse.json({
      profiles: (profiles ?? []).map((profile) => ({ ...profile, last_sign_in_at: lastSignInById.get(profile.id) ?? null })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load user accounts." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireAdmin(request);
    if ("error" in access) return access.error;
    const body = await request.json().catch(() => ({})) as { userId?: string; email?: string; fullName?: string; role?: string; interfaceMode?: string; accessGroup?: string };
    const email = body.email?.trim().toLowerCase() || null;
    const fullName = body.fullName?.trim() || null;
    const role = body.role?.trim().toLowerCase();
    const interfaceMode = body.interfaceMode?.trim().toLowerCase();
    const accessGroup = body.accessGroup?.trim().toLowerCase() || null;
    if (!body.userId) return NextResponse.json({ error: "Choose a user account." }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (!role || !["admin", "requester", "customer", "user"].includes(role)) return NextResponse.json({ error: "Choose a valid account role." }, { status: 400 });
    if (!interfaceMode || !["standard", "front_counter"].includes(interfaceMode)) return NextResponse.json({ error: "Choose a valid interface mode." }, { status: 400 });
    if (accessGroup && !accessGroupIds.includes(accessGroup as (typeof accessGroupIds)[number])) return NextResponse.json({ error: "Choose a valid access group." }, { status: 400 });
    const { error } = await access.supabase.rpc("admin_update_user_account", {
      p_user_id: body.userId, p_full_name: fullName, p_email: email, p_role: role, p_interface_mode: interfaceMode,
    });
    if (error) throw new Error(error.message);
    if (accessGroup) {
      const { error: accessGroupError } = await access.supabase.rpc("set_profile_access_group", { p_user: body.userId, p_group: accessGroup });
      if (accessGroupError) throw new Error(accessGroupError.message);
    }
    return NextResponse.json({ ok: true, email, fullName, role, interfaceMode, accessGroup });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the email." }, { status: 400 });
  }
}
