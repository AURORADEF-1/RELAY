"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { accessGroupIds, accessGroupLabels } from "@/lib/access-groups";
import { getSupabaseAccessToken } from "@/lib/supabase";

type Profile = { id: string; full_name: string | null; role: string | null; email: string | null; interface_mode: string | null; access_group: string | null; last_sign_in_at: string | null };
type Draft = { fullName: string; email: string; role: string; interfaceMode: string; accessGroup: string };
type SortKey = "fullName" | "email" | "role" | "accessGroup" | "interfaceMode" | "lastLogin";

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "fullName", label: "Display name" },
  { key: "email", label: "Contact email" },
  { key: "role", label: "Role" },
  { key: "accessGroup", label: "Access group" },
  { key: "interfaceMode", label: "Interface" },
  { key: "lastLogin", label: "Last login" },
];

export function AdminUserEmailPanel() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("fullName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const load = useCallback(async () => {
    try {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/admin/user-emails", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json() as { profiles?: Profile[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to load user accounts.");
      const rows = result.profiles ?? []; setProfiles(rows); setDrafts(Object.fromEntries(rows.map((row) => [row.id, { fullName: row.full_name ?? "", email: row.email ?? "", role: row.role ?? "requester", interfaceMode: row.interface_mode ?? "standard", accessGroup: accessGroupIds.includes(row.access_group as (typeof accessGroupIds)[number]) ? row.access_group ?? "" : "" }])));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to load user accounts."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sortedProfiles = useMemo(() => [...profiles].sort((left, right) => {
    if (sortKey === "lastLogin") {
      const leftTime = left.last_sign_in_at ? new Date(left.last_sign_in_at).getTime() : 0;
      const rightTime = right.last_sign_in_at ? new Date(right.last_sign_in_at).getTime() : 0;
      return (leftTime - rightTime) * (sortDirection === "asc" ? 1 : -1);
    }
    const leftDraft = drafts[left.id];
    const rightDraft = drafts[right.id];
    const leftValue = leftDraft?.[sortKey] ?? "";
    const rightValue = rightDraft?.[sortKey] ?? "";
    return leftValue.localeCompare(rightValue, "en-GB", { sensitivity: "base", numeric: true }) * (sortDirection === "asc" ? 1 : -1);
  }), [drafts, profiles, sortDirection, sortKey]);

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(nextKey); setSortDirection("asc"); }
  }

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
    <div className="admin-user-sort-bar" aria-label="Sort user accounts"><span>Sort by</span>{sortOptions.map((option) => <button key={option.key} type="button" onClick={() => changeSort(option.key)} className={sortKey === option.key ? "is-active" : ""} aria-pressed={sortKey === option.key}>{option.label}{sortKey === option.key ? <b aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</b> : null}</button>)}</div>
    <div className="mt-3 grid gap-3">{sortedProfiles.map((profile) => <div key={profile.id} className="admin-control-list-row rounded-[1.25rem] border border-[color:var(--border)] bg-[color:var(--background-panel-strong)] p-4">
      <div className="admin-user-account-grid"><label>Display name<input value={drafts[profile.id]?.fullName ?? ""} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], fullName: e.target.value } })} className="aurora-input" /></label>
      <label>Contact email<input type="email" value={drafts[profile.id]?.email ?? ""} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], email: e.target.value } })} placeholder="name@company.co.uk" className="aurora-input" /></label>
      <label>Role<select value={drafts[profile.id]?.role ?? "requester"} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], role: e.target.value } })} className="aurora-select"><option value="requester">Requester</option><option value="user">User</option><option value="customer">Customer</option><option value="admin">Administrator</option></select></label>
      <label>Access group<select value={drafts[profile.id]?.accessGroup ?? ""} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], accessGroup: e.target.value } })} className="aurora-select"><option value="">Unassigned</option>{accessGroupIds.map((group) => <option key={group} value={group}>{accessGroupLabels[group]}</option>)}</select></label>
      <label>Interface<select value={drafts[profile.id]?.interfaceMode ?? "standard"} onChange={(e) => setDrafts({ ...drafts, [profile.id]: { ...drafts[profile.id], interfaceMode: e.target.value } })} className="aurora-select"><option value="standard">Standard</option><option value="front_counter">Front Counter</option></select></label>
      <div className="admin-user-last-login"><span>Last login</span><strong>{formatLastLogin(profile.last_sign_in_at)}</strong></div>
      <button onClick={() => void save(profile.id)} disabled={saving === profile.id} className="aurora-button-primary disabled:opacity-60">{saving === profile.id ? "Saving…" : "Save changes"}</button></div>
    </div>)}</div>
  </section>;
}

function formatLastLogin(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
