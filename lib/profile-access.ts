import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppProfileRole = string | null;
export type AppProfile = {
  role: AppProfileRole;
  username?: string | null;
} | null;

export function isAdmin(user: User | null, profile: AppProfile) {
  return (
    profile?.role === "admin" ||
    user?.email === "admin@mlp.local" ||
    profile?.username?.includes(".admin") === true
  );
}

export async function getCurrentUserWithRole(supabase: SupabaseClient): Promise<{
  user: User | null;
  role: AppProfileRole;
  profile: AppProfile;
  isAdmin: boolean;
}> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!user) {
    return { user: null, role: null, profile: null, isAdmin: false };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const normalizedProfile: AppProfile = profile
    ? {
        role: typeof profile.role === "string" ? profile.role : null,
        username:
          typeof profile.username === "string" ? profile.username : null,
      }
    : null;

  return {
    user,
    role: normalizedProfile?.role ?? null,
    profile: normalizedProfile,
    isAdmin: isAdmin(user, normalizedProfile),
  };
}
