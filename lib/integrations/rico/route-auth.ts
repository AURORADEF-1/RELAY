import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { getRelaySessionUserFromRequest } from "@/lib/security";

export type RicoRouteAuth =
  | { ok: true; user: { id: string; email?: string | null }; supabase: SupabaseClient }
  | { ok: false; status: 401 | 403 | 500; error: string };

export function isRicoAdmin(user: { email?: string | null }, role?: string | null) {
  const normalizedRole = role?.trim().toLowerCase();
  const email = (user.email ?? "").trim().toLowerCase();
  const localPart = email.split("@")[0] ?? "";
  return normalizedRole === "admin" || email === "admin@mlp.local" || localPart.endsWith(".admin");
}

export async function authorizeRicoRoute(request: NextRequest): Promise<RicoRouteAuth> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, status: 500, error: "RELAY authentication is not configured." };
  }

  const user = await getRelaySessionUserFromRequest(request);
  if (!user?.id || !authorization) {
    return { ok: false, status: 401, error: "Authentication is required." };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role?: string | null }>();
  if (error) return { ok: false, status: 500, error: "Unable to verify RELAY access." };

  if (!isRicoAdmin(user, profile?.role)) {
    return { ok: false, status: 403, error: "Admin access is required." };
  }
  return {
    ok: true,
    user: { id: user.id, email: user.email ?? null },
    supabase,
  };
}
