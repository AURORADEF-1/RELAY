"use client";

import { useEffect, useMemo, useState } from "react";
import {
  accessGroupDescriptions,
  accessGroupIds,
  accessGroupLabels,
  normalizeAccessGroup,
  type AccessGroupId,
} from "@/lib/access-groups";
import { clearCurrentUserWithRoleCache } from "@/lib/profile-access";
import { getSupabaseClient } from "@/lib/supabase";

type ProfileRow = {
  id: string;
  full_name: string | null;
  role: string | null;
  access_group: string | null;
};

export function AdminAccessGroupsPanel() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Supabase is not configured.");
    const result = await supabase
      .from("profiles")
      .select("id,full_name,role,access_group")
      .order("full_name");
    if (result.error) throw new Error(result.error.message);
    setProfiles((result.data ?? []) as ProfileRow[]);
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load()
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load users."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return profiles.filter((profile) =>
      !needle || `${profile.full_name ?? ""} ${profile.role ?? ""}`.toLowerCase().includes(needle),
    );
  }, [profiles, query]);

  async function save(profile: ProfileRow, accessGroup: AccessGroupId) {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingId(profile.id);
    setError("");
    setMessage("");
    const result = await supabase.rpc("set_profile_access_group", {
      p_user: profile.id,
      p_group: accessGroup,
    });
    if (result.error) setError(result.error.message);
    else {
      setProfiles((current) => current.map((row) =>
        row.id === profile.id ? { ...row, access_group: accessGroup } : row,
      ));
      clearCurrentUserWithRoleCache();
      setMessage(`${profile.full_name || "User"} assigned to ${accessGroupLabels[accessGroup]}.`);
    }
    setSavingId("");
  }

  return (
    <section className="relay-card">
      <div className="relay-section-heading">
        <div>
          <p className="relay-eyebrow">Users &amp; access</p>
          <h2>Access groups</h2>
          <p>Assign each member to the interface and navigation intended for their team.</p>
        </div>
        <input
          aria-label="Find a user"
          placeholder="Find a user"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr><th>User</th><th>Current group</th><th>Access</th></tr></thead>
          <tbody>
            {filtered.map((profile) => {
              const group = typeof profile.access_group === "string"
                ? normalizeAccessGroup(profile.access_group)
                : null;
              return <tr key={profile.id}>
                <th scope="row">{profile.full_name || "Unnamed user"}<small className="block opacity-60">{profile.role}</small></th>
                <td>{group ? accessGroupLabels[group] : "Legacy access (unassigned)"}</td>
                <td>
                  <select
                    aria-label={`Access group for ${profile.full_name || "user"}`}
                    value={group ?? ""}
                    disabled={loading || savingId === profile.id}
                    onChange={(event) => {
                      if (event.target.value) void save(profile, event.target.value as AccessGroupId);
                    }}
                  >
                    <option value="" disabled>Choose a group</option>
                    {accessGroupIds.map((id) => <option key={id} value={id}>{accessGroupLabels[id]}</option>)}
                  </select>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <details>
        <summary>What each group can see</summary>
        <ul>{accessGroupIds.map((id) => <li key={id}><strong>{accessGroupLabels[id]}:</strong> {accessGroupDescriptions[id]}</li>)}</ul>
      </details>
    </section>
  );
}
