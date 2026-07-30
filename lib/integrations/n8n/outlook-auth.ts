import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

function tokenMatches(provided: string, expected: string) {
  return timingSafeEqual(digest(provided), digest(expected));
}

export function getN8nBearerToken(authorizationHeader: string | null) {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function authorizeN8nOutlook(
  authorizationHeader: string | null,
  currentToken = process.env.N8N_OUTLOOK_WEBHOOK_SECRET,
  previousToken = process.env.N8N_OUTLOOK_WEBHOOK_SECRET_PREVIOUS,
) {
  const provided = getN8nBearerToken(authorizationHeader);
  if (!provided || !currentToken?.trim()) return false;

  return [currentToken, previousToken]
    .filter((token): token is string => Boolean(token?.trim()))
    .some((token) => tokenMatches(provided, token.trim()));
}
