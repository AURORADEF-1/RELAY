"use client";

import { useCallback, useEffect, useState } from "react";
import { accessGroupIds, accessGroupLabels } from "@/lib/access-groups";
import { getSupabaseAccessToken, getSupabaseClient } from "@/lib/supabase";

type Profile = { id: string; full_name: string | null; role: string | null; email: string | null; interface_mode: string | null; access_group: string | null };
type Draft = { fullName: string; email: string; role: string; interfaceMode: string; accessGroup: string };

export function AdminUserEmailPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const supabase = getSupabaseClient(); if (!supabase) return;
    const { data, error } = await supabase.from("profiles").select("id, full_name, role, email, interface_mode, access_group").order("full_name");
    if (error) { setNotice(error.message); return; }
    const rows = (data ?? []) as Profile[]; setProfiles(rows); setDrafts(Object.fromEntries(rows.map((row) => [row.id, { fullName: row.full_name ?? "", email: row.email ?? "", role: row.role ?? "requester", interfaceMode: row.interface_mode ?? "standard", accessGroup: accessGroupIds.includes(row.access_group as (typeof accessGroupIds)[number]) ? row.access_group ?? "" : "" }])));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(userId: string) {
    setSaving(userId); setNotice("");
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/admin/user-emails", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ userId, ...drafts[userId] }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to save the email.");
      setNotice("User account updated."); await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to save the email."); }
    finally { setSaving(null); }
  }

  return <section className="aurora-section admin-control-panel">
    <div className="aurora-kicker">Account directory</div><h2 className="mt-4 aurora-heading">Users &amp; Access</h2>
    <p className="mt-3 aurora-copy">View every AssetCare+ account and maintain its display name, contact email, role, access group, and interface access.</p>
    {notice ? <div className="mt-5 aurora-alert">{notice}</div> : null}
    <div className="mt-6 grid gap-3">{profiles.map((profile) => <div key={profile.id} className="admin-control-list-row rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4">
      <div className="admin-user-account-grid"><label>Display name<input value={drafts[profile.id]?.fullName ?? ""} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], fullName: e.target.value } })} className="aurora-input" /></label>
      <label>Contact email<input type="email" value={drafts[profile.id]?.email ?? ""} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], email: e.target.value } })} placeholder="name@company.co.uk" className="aurora-input" /></label>
      <label>Role<select value={drafts[profile.id]?.role ?? "requester"} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], role: e.target.value } })} className="aurora-select"><option value="requester">Requester</option><option value="user">User</option><option value="customer">Customer</option><option value="admin">Administrator</option></select></label>
      <label>Access group<select value={drafts[profile.id]?.accessGroup ?? ""} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], accessGroup: e.target.value } })} className="aurora-select"><option value="">Unassigned</option>{accessGroupIds.map((group) => <option key={group} value={group}>{accessGroupLabels[group]}</option>)}</select></label>
      <label>Interface<select value={drafts[profile.id]?.interfaceMode ?? "standard"} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], interfaceMode: e.target.value } })} className="aurora-select"><option value="standard">Standard</option><option value="front_counter">Front Counter</option></select></label>
      <button onClick={() => void save(profile.id)} disabled={saving === profile.id} className="aurora-button-primary disabled:opacity-60">{saving === profile.id ? "Saving…" : "Save changes"}</button></div>
    </div>)}</div>
  </section>;
}
