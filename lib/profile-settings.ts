import type { SupabaseClient } from "@supabase/supabase-js";
import { RELAY_MEDIA_BUCKET } from "@/lib/relay-ticketing";

export type ProfileSettingsRecord = {
  id: string;
  full_name: string | null;
  role: string | null;
  avatar_path: string | null;
  avatar_url?: string | null;
};

export async function fetchCurrentProfileSettings(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const profile = (data ?? null) as Record<string, unknown> | null;
  const avatarPath = typeof profile?.avatar_path === "string" ? profile.avatar_path : null;

  return {
    id: userId,
    full_name: typeof profile?.full_name === "string" ? profile.full_name : null,
    role: typeof profile?.role === "string" ? profile.role : null,
    avatar_path: avatarPath,
    avatar_url: await createSignedProfileAvatarUrl(supabase, avatarPath),
  } satisfies ProfileSettingsRecord;
}

export async function updateProfileSettings(
  supabase: SupabaseClient,
  payload: {
    userId: string;
    fullName: string;
    avatarPath?: string | null;
  },
) {
  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: payload.userId,
        full_name: payload.fullName.trim() || null,
        ...(payload.avatarPath !== undefined ? { avatar_path: payload.avatarPath } : {}),
      },
      { onConflict: "id" },
    );

  if (error) {
    throw new Error(error.message);
  }
}

export async function uploadProfileAvatar(
  supabase: SupabaseClient,
  payload: {
    userId: string;
    file: File;
  },
) {
  const extension = payload.file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storagePath = `profiles/${payload.userId}/avatar-${Date.now()}.${extension.replace(/[^a-z0-9]/gi, "")}`;

  const { error: uploadError } = await supabase.storage
    .from(RELAY_MEDIA_BUCKET)
    .upload(storagePath, payload.file, {
      upsert: true,
      contentType: payload.file.type || undefined,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return storagePath;
}

export async function fetchProfileAvatarUrls(
  supabase: SupabaseClient,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (uniqueUserIds.length === 0) {
    return {} as Record<string, string | null>;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .in("id", uniqueUserIds);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const avatarEntries = await Promise.all(
    rows.map(async (row) => {
      const id = typeof row.id === "string" ? row.id : "";
      const avatarPath = typeof row.avatar_path === "string" ? row.avatar_path : null;
      return [id, await createSignedProfileAvatarUrl(supabase, avatarPath)] as const;
    }),
  );

  return Object.fromEntries(avatarEntries);
}

async function createSignedProfileAvatarUrl(
  supabase: SupabaseClient,
  avatarPath: string | null,
) {
  if (!avatarPath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(RELAY_MEDIA_BUCKET)
    .createSignedUrl(avatarPath, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}
