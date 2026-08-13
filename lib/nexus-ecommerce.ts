import { getSupabaseAccessToken } from "@/lib/supabase";

export async function syncNexusEcommerceOrderStatus(ticketId: string) {
  const accessToken = await getSupabaseAccessToken();
  if (!accessToken) throw new Error("A RELAY session is required for NEXUS status sync");

  const response = await fetch("/api/integrations/nexus/orders/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ticketId }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error || "NEXUS status sync failed");
  }
}
