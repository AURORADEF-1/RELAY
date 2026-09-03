import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260903111655_harden_profile_role_permissions.sql";

describe("RELAY profile permissions", () => {
  it("reserves role and interface mode changes for trusted administration", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "revoke all privileges on table public.profiles from anon",
    );
    expect(migration).toContain(
      "grant insert (id, full_name, avatar_path) on table public.profiles to authenticated",
    );
    expect(migration).toContain(
      "grant update (full_name, avatar_path) on table public.profiles to authenticated",
    );
    expect(migration).not.toContain(
      "grant update (role, interface_mode) on table public.profiles to authenticated",
    );
  });

  it("creates least-privilege profiles for new and existing auth users", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("create trigger relay_user_profile_on_signup");
    expect(migration).toContain("after insert on auth.users");
    expect(migration).toContain("'requester',\n    'standard'");
    expect(migration).toContain("left join public.profiles profile on profile.id = users.id");
    expect(migration).toContain(
      "revoke all on function public.handle_new_relay_user() from public, anon, authenticated",
    );
  });

  it("retires front-counter waits when a READY ticket leaves that state", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain(
      "create trigger cancel_stale_front_counter_collection_on_ticket",
    );
    expect(migration).toContain("if old.status = 'READY' and new.status <> 'READY'");
    expect(migration).toContain("and request.state = 'WAITING'");
    expect(migration).toContain("and ticket.status <> 'READY'");
  });
});
