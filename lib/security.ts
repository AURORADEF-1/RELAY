import type { NextRequest } from "next/server";

const GENERIC_USER_ERROR = "Unable to complete the request right now.";
const GENERIC_AUTH_ERROR = "Invalid email or password.";

export function sanitizeUserFacingError(
  error: unknown,
  fallbackMessage = GENERIC_USER_ERROR,
) {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";

  if (!message) {
    return fallbackMessage;
  }

  if (
    message === "Supabase environment variables are not configured." ||
    message.startsWith("Sign in ") ||
    message.includes("not found") ||
    message.startsWith("Admin access is required")
  ) {
    return message;
  }

  if (
    /permission|forbidden|unauthorized|not allowed|not authorised|row-level security|rls|jwt/i.test(
      message,
    )
  ) {
    return "You do not have permission to perform that action.";
  }

  if (/invalid login credentials/i.test(message)) {
    return GENERIC_AUTH_ERROR;
  }

  return fallbackMessage;
}

export function sanitizeAuthError(error: unknown) {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";

  if (/email not confirmed/i.test(message)) {
    return "Your account is not ready for sign-in yet.";
  }

  return sanitizeUserFacingError(error, GENERIC_AUTH_ERROR);
}

function getSupabasePublicConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getRelaySessionUserFromRequest(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const accessToken = getBearerToken(request);

  if (!config || !accessToken) {
    return null;
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { id?: string; email?: string | null };

  return payload.id ? payload : null;
}

export async function requestCanAccessTicket(
  request: NextRequest,
  ticketId: string,
) {
  const config = getSupabasePublicConfig();
  const accessToken = getBearerToken(request);

  if (!config || !accessToken || !ticketId.trim()) {
    return false;
  }

  const lookupUrl = new URL(`${config.supabaseUrl}/rest/v1/tickets`);
  lookupUrl.searchParams.set("id", `eq.${ticketId}`);
  lookupUrl.searchParams.set("select", "id");
  lookupUrl.searchParams.set("limit", "1");

  const response = await fetch(lookupUrl.toString(), {
    method: "GET",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return false;
  }

  const payload = (await response.json()) as Array<{ id?: string }>;
  return payload.length > 0;
}

export function isAllowedMediaProxySource(source: string) {
  const config = getSupabasePublicConfig();

  if (!config) {
    return false;
  }

  let targetUrl: URL;
  let supabaseUrl: URL;

  try {
    targetUrl = new URL(source);
    supabaseUrl = new URL(config.supabaseUrl);
  } catch {
    return false;
  }

  if (targetUrl.protocol !== "https:") {
    return false;
  }

  if (targetUrl.host !== supabaseUrl.host) {
    return false;
  }

  return targetUrl.pathname.startsWith("/storage/v1/object/");
}
