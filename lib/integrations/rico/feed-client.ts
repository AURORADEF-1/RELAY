import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  isUsableRicoFleetSerial,
  ricoFleetFeedPageSchema,
  toRicoFleetFeedMachine,
  type RicoFleetFeedQuery,
} from "@/lib/integrations/rico/feed-types";

function getFeedSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("RICO fleet feed data source is not configured.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getRicoFleetFeedPage(query: RicoFleetFeedQuery, partnerToken: string) {
  const supabase = getFeedSupabaseClient();
  const { data, error } = await supabase.rpc("rico_fleet_feed_page", {
    p_token: partnerToken,
    p_limit: query.limit,
    p_offset: query.offset,
    p_updated_since: query.updatedSince,
  });

  if (error) {
    throw new Error("Unable to read the RELAY fleet registry.");
  }

  const parsed = ricoFleetFeedPageSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("The RELAY fleet registry returned an invalid response.");
  }

  const rows = parsed.data.rows.filter((row) => isUsableRicoFleetSerial(row.serial_number));
  const total = parsed.data.total;
  const nextOffset = query.offset + rows.length;

  return {
    total,
    count: rows.length,
    offset: query.offset,
    nextOffset: nextOffset < total ? nextOffset : null,
    excludedCount: parsed.data.excluded,
    machines: rows.map(toRicoFleetFeedMachine),
  };
}
