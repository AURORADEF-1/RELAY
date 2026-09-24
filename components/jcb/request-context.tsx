"use client";
import { useEffect, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/supabase";

export function LiveLinkRequestContext({ onUse }: { onUse: (machineReference: string, text: string) => void }) {
  const [context, setContext] = useState<{ machineReference: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [used, setUsed] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const pin = query.get("livelink");
    if (!pin) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await getSupabaseAccessToken();
        if (!token) throw new Error("Sign in to attach the LiveLink position.");
        const params = new URLSearchParams({ pin });
        if (query.get("livelinkFault")) params.set("fault", query.get("livelinkFault")!);
        const response = await fetch(`/api/integrations/jcb/context?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the LiveLink snapshot.");
        setContext(data);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load the LiveLink snapshot."); }
    })();
    return () => controller.abort();
  }, []);
  if (!context && !error) return null;
  return <section className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-900" aria-label="LiveLink parts request context">
    <h2 className="font-semibold">Parts request from JCB LiveLink</h2>
    {error ? <p role="alert">{error} You can still enter a normal parts request below.</p> : <>
      <p className="mt-2 whitespace-pre-line text-sm">{context!.text}</p>
      <button type="button" className="mt-3 rounded-lg bg-teal-800 px-4 py-3 text-white disabled:opacity-60" disabled={used} onClick={() => { onUse(context!.machineReference, context!.text); setUsed(true); }}>{used ? "Snapshot added to request details" : "Add this snapshot to request details"}</button>
      <p className="mt-2 text-sm">Add the parts or symptoms needed below. The snapshot keeps these reading times when saved with your request.</p>
    </>}
  </section>;
}
