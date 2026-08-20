import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260820115001_add_front_counter_printer_failover.sql";

describe("Front Counter printer failover", () => {
  it("makes Front Counter primary and Samantha the single backup", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("lower(users.email) = 'frontcounter.user@mlp.local'");
    expect(migration).toContain("lower(users.email) = 'samanthac.admin@mlp.local'");
    expect(migration).toContain("is_default = true");
    expect(migration).toContain("is_backup = true");
    expect(migration).toContain("label_print_stations_one_backup_idx");
  });

  it("reroutes queued and retrying labels when the primary faults", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("reroute_label_jobs_on_station_fault");
    expect(migration).toContain("job.status in ('QUEUED', 'RETRY')");
    expect(migration).toContain("route_unhealthy_primary_jobs_to_backup");
    expect(migration).toContain("primary_station.last_seen_at > now() - interval '90 seconds'");
  });

  it("routes new READY labels to the healthy primary before the backup", async () => {
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toContain("case when station.is_default then 0 else 1 end");
    expect(migration).toContain("station.last_error is null");
    expect(migration).toContain("or station.is_backup");
  });
});
