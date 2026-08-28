export function normalizeRequesterProfileName(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") || "";
}

export function requesterProfileKey(
  userId: string | null | undefined,
  requesterName: string | null | undefined,
) {
  const stableUserId = userId?.trim();
  if (stableUserId) {
    return `user:${stableUserId}`;
  }

  const normalizedName = normalizeRequesterProfileName(requesterName);
  return normalizedName ? `name:${normalizedName}` : "";
}

export function requesterProfileHref({
  userId,
  requesterName,
}: {
  userId: string | null | undefined;
  requesterName: string | null | undefined;
}) {
  const key = requesterProfileKey(userId, requesterName);
  return key
    ? `/reports?tab=requesters&requester=${encodeURIComponent(key)}`
    : "/reports?tab=requesters";
}
