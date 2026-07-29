import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function tokenMatches(provided: string, expected: string) {
  return timingSafeEqual(digest(provided), digest(expected));
}

export function getBearerToken(authorizationHeader: string | null) {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function authorizeRicoFleetFeed(
  authorizationHeader: string | null,
  currentToken = process.env.RICO_FLEET_FEED_TOKEN,
  previousToken = process.env.RICO_FLEET_FEED_TOKEN_PREVIOUS,
) {
  const provided = getBearerToken(authorizationHeader);
  if (!provided || !currentToken?.trim()) {
    return false;
  }

  return [currentToken, previousToken]
    .filter((token): token is string => Boolean(token?.trim()))
    .some((token) => tokenMatches(provided, token.trim()));
}
