"use client";

import { useEffect, useRef } from "react";
import { getCurrentUserWithRole } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type CupsStation = {
  user_id: string;
  printer_name: string | null;
  enabled: boolean;
  auto_print: boolean;
  transport: string;
  local_endpoint: string | null;
};

type CupsPrintJob = {
  id: string;
  label_token: string;
  job_number: string;
  requested_by: string | null;
  ready_at: string;
  part_number: string | null;
  part_description: string | null;
  unit_index: number;
  unit_total: number;
  bin_location: string;
};

type CupsHealth = { ok: boolean; printer?: string; error?: string };

const RECONCILE_MS = 15_000;

export function CupsPrintStation() {
  const workingRef = useRef(false);

  useEffect(() => {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;
    const supabase = supabaseClient;
    let disposed = false;
    let timer: number | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const sessionId = crypto.randomUUID();

    async function updateHealth(station: CupsStation, patch: Record<string, string | null>) {
      await supabase.from("label_print_stations").update({
        ...patch,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("user_id", station.user_id);
    }

    async function loadStation() {
      const access = await getCurrentUserWithRole(supabase, { forceFresh: true });
      if (!access.user || !access.isFrontCounter) return null;
      const { data, error } = await supabase.from("label_print_stations")
        .select("user_id, printer_name, enabled, auto_print, transport, local_endpoint")
        .eq("user_id", access.user.id)
        .maybeSingle();
      if (error) throw error;
      return data as CupsStation | null;
    }

    async function reconcile() {
      if (workingRef.current || disposed) return;
      workingRef.current = true;
      let station: CupsStation | null = null;
      try {
        station = await loadStation();
        if (!station || !station.enabled || !station.auto_print || station.transport !== "cups") return;
        const endpoint = (station.local_endpoint || "http://127.0.0.1:8765").replace(/\/$/, "");
        const healthResponse = await fetch(`${endpoint}/health`, { cache: "no-store" });
        const health = await healthResponse.json() as CupsHealth;
        if (!healthResponse.ok || !health.ok) throw new Error(health.error || "The local CUPS bridge is unavailable.");
        await updateHealth(station, {
          printer_name: health.printer || station.printer_name,
          last_printer_check_at: new Date().toISOString(),
          last_error: null,
        });

        for (let count = 0; count < 10 && !disposed; count += 1) {
          const { data, error } = await supabase.rpc("claim_next_label_print_job", { p_session_id: sessionId });
          if (error) throw error;
          const job = Array.isArray(data) ? data[0] as CupsPrintJob | undefined : undefined;
          if (!job) break;
          try {
            const response = await fetch(`${endpoint}/print`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(job),
            });
            const result = await response.json() as CupsHealth;
            if (!response.ok || !result.ok) throw new Error(result.error || "CUPS rejected the label.");
            const { error: completeError } = await supabase.rpc("complete_label_print_job", {
              p_job_id: job.id,
              p_session_id: sessionId,
              p_printer_name: result.printer || health.printer || "CUPS",
            });
            if (completeError) throw completeError;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await supabase.rpc("fail_label_print_job", { p_job_id: job.id, p_session_id: sessionId, p_error: message });
            throw error;
          }
        }
      } catch (error) {
        if (station) {
          await updateHealth(station, {
            last_printer_check_at: new Date().toISOString(),
            last_error: error instanceof Error ? error.message : String(error),
          });
        }
        console.error("RELAY Front Counter CUPS station", error);
      } finally {
        workingRef.current = false;
      }
    }

    void reconcile();
    timer = window.setInterval(() => void reconcile(), RECONCILE_MS);
    void loadStation().then((station) => {
      if (!station || disposed) return;
      channel = supabase.channel(`relay-cups-station-${station.user_id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "label_print_jobs", filter: `target_user_id=eq.${station.user_id}` }, () => void reconcile())
        .subscribe();
    });

    return () => {
      disposed = true;
      if (timer !== null) window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
