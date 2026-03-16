import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppProfileRole = string | null;
export type AppProfile = {
  role: AppProfileRole;
  username?: string | null;
  display_name?: string | null;
} | null;

export type AccessLevel = "admin" | "user";

export function getAccessLevel(user: User | null, profile: AppProfile): AccessLevel {
  const email = (user?.email || "").toLowerCase().trim();
  const username = (profile?.username || "").toLowerCase().trim();
  const displayName = (profile?.display_name || "").toLowerCase().trim();
  const role = (profile?.role || "").toLowerCase().trim();
  const identity = `${username} ${displayName}`;

  if (email === "admin@mlp.local") {
    return "admin";
  }

  if (email.includes(".admin")) {
    return "admin";
  }

  if (email.includes(".user")) {
    return "user";
  }

  if (identity.includes(".admin")) {
    return "admin";
  }

  if (identity.includes(".user")) {
    return "user";
  }

  if (role === "admin") {
    return "admin";
  }

  if (role === "user") {
    return "user";
  }

  return "user";
}

export function isAdmin(user: User | null, profile: AppProfile) {
  return getAccessLevel(user, profile) === "admin";
}

export function isUserOnly(user: User | null, profile: AppProfile) {
  return getAccessLevel(user, profile) === "user";
}

function getDerivedProfileRole(user: User | null): "admin" | "user" | null {
  const email = (user?.email || "").toLowerCase().trim();

  if (email === "admin@mlp.local" || email.includes(".admin")) {
    return "admin";
  }

  if (email.includes(".user")) {
    return "user";
  }

  return null;
}

async function syncProfileAccessRole(
  supabase: SupabaseClient,
  user: User,
  profile: AppProfile,
) {
  const derivedRole = getDerivedProfileRole(user);

  if (!derivedRole || profile?.role === derivedRole) {
    return profile;
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        role: derivedRole,
        username: profile?.username ?? null,
        full_name: profile?.display_name ?? null,
      },
      {
        onConflict: "id",
      },
    )
    .select("role, username, full_name")
    .maybeSingle();

  if (error) {
    console.warn("RELAY profile role sync failed", error.message);
    return profile;
  }

  return data
    ? {
        role: typeof data.role === "string" ? data.role : derivedRole,
        username: typeof data.username === "string" ? data.username : null,
        display_name:
          typeof data.full_name === "string" ? data.full_name : null,
      }
    : {
        role: derivedRole,
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
      };
}

export async function getCurrentUserWithRole(supabase: SupabaseClient): Promise<{
  user: User | null;
  role: AppProfileRole;
  profile: AppProfile;
  accessLevel: AccessLevel;
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
    return {
      user: null,
      role: null,
      profile: null,
      accessLevel: "user",
      isAdmin: false,
    };
  }

  const emailAccessLevel = getAccessLevel(user, null);
  if (emailAccessLevel === "admin") {
    console.log("RELAY access debug", {
      authEmail: user?.email,
      profileRole: null,
      profileUsername: null,
      profileDisplayName: null,
      computedAccess: emailAccessLevel,
    });

    return {
      user,
      role: null,
      profile: null,
      accessLevel: emailAccessLevel,
      isAdmin: true,
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, username, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("RELAY profile lookup fallback", profileError.message);
  }

  const normalizedProfile: AppProfile = profile && !profileError
    ? {
        role: typeof profile.role === "string" ? profile.role : null,
        username:
          typeof profile.username === "string" ? profile.username : null,
        display_name:
          typeof profile.full_name === "string" ? profile.full_name : null,
      }
    : null;

  const syncedProfile = await syncProfileAccessRole(
    supabase,
    user,
    normalizedProfile,
  );

  const accessLevel = getAccessLevel(user, syncedProfile);

  console.log("RELAY access debug", {
    authEmail: user?.email,
    profileRole: syncedProfile?.role,
    profileUsername: syncedProfile?.username,
    profileDisplayName: syncedProfile?.display_name,
    computedAccess: accessLevel,
  });

  return {
    user,
    role: syncedProfile?.role ?? null,
    profile: syncedProfile,
    accessLevel,
    isAdmin: accessLevel === "admin",
  };
}
