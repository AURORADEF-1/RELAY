"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export function AdminOversightAccessPanel() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function updateAccess(enabled: boolean) {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("RELAY authentication is not configured.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("set_oversight_access", {
      target_email: normalizedEmail,
      should_enable: enabled,
    });
    if (rpcError) setError(rpcError.message);
    else setMessage(enabled ? "Oversight access enabled. The user will set up two-factor authentication when they first open Oversight." : "Oversight access removed.");
    setBusy(false);
  }

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Secure access</p>
      <h2 className="mt-2 text-2xl font-black text-slate-950">Oversight users</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Approve an existing RELAY account by email. Oversight remains locked until that user signs in with their password and completes authenticator-app two-factor verification.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="oversight-user-email">RELAY account email</label>
        <input
          id="oversight-user-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@mervynlambert.co.uk"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-950 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
        <button type="button" disabled={busy || !email.trim()} onClick={() => void updateAccess(true)} className="rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-50">Enable access</button>
        <button type="button" disabled={busy || !email.trim()} onClick={() => void updateAccess(false)} className="rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 disabled:opacity-50">Remove</button>
      </div>
      {message ? <p className="mt-4 text-sm font-semibold text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 text-sm font-semibold text-rose-700">{error}</p> : null}
    </section>
  );
}
