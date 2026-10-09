import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { accessGroupHome, canAccessPath, canUsePage, normalizeAccessGroup } from "@/lib/access-groups";

describe("access groups", () => {
  it("normalizes stored groups safely", () => {
    expect(normalizeAccessGroup("workshop")).toBe("workshop");
    expect(normalizeAccessGroup("unknown")).toBe("fitter");
  });

  it("keeps each non-admin group inside its approved areas", () => {
    expect(canAccessPath("fitter", "/submit")).toBe(true);
    expect(canAccessPath("fitter", "/fleet/map")).toBe(true);
    expect(canAccessPath("fitter", "/fleet/register")).toBe(false);
    expect(canAccessPath("workshop", "/incidents/tasks/completed")).toBe(true);
    expect(canAccessPath("workshop", "/console")).toBe(true);
    for (const route of ["/assets", "/assets/inbox", "/fleet", "/fleet/map", "/fleet/register", "/fleet/trips", "/fleet/scheduler"]) {
      expect(canAccessPath("workshop", route)).toBe(true);
      expect(canAccessPath("transport", route)).toBe(true);
      expect(canAccessPath("office", route)).toBe(true);
    }
    expect(canAccessPath("workshop", "/admin")).toBe(false);
    expect(canAccessPath("parts", "/parts-knowledge")).toBe(true);
    expect(canAccessPath("parts", "/admin")).toBe(false);
    expect(canAccessPath("parts", "/submit")).toBe(true);
    expect(canAccessPath("parts", "/stores")).toBe(true);
    expect(canAccessPath("parts", "/filters")).toBe(true);
    expect(canAccessPath("parts", "/console")).toBe(true);
    expect(canAccessPath("parts", "/my-jobs")).toBe(true);
    expect(canAccessPath("parts", "/completed")).toBe(true);
    expect(canAccessPath("parts", "/reports")).toBe(true);
    expect(canAccessPath("parts", "/control")).toBe(false);
    expect(canAccessPath("transport", "/fleet/trips")).toBe(true);
    expect(canAccessPath("transport", "/console")).toBe(true);
    expect(canAccessPath("transport", "/parts-knowledge")).toBe(false);
    expect(canAccessPath("transport", "/fleet/operations")).toBe(false);
    expect(canAccessPath("office", "/reports")).toBe(true);
    expect(canAccessPath("office", "/console")).toBe(true);
    expect(canAccessPath("office", "/parts-knowledge")).toBe(false);
    expect(canAccessPath("assetcare", "/fleet/register")).toBe(true);
    expect(canAccessPath("assetcare", "/fleet/trips")).toBe(false);
    expect(canAccessPath("front_counter", "/terminal")).toBe(true);
    expect(canAccessPath("front_counter", "/requests")).toBe(false);
    expect(canAccessPath("admin", "/control")).toBe(true);
  });

  it("routes each group to a valid home", () => {
    expect(accessGroupHome("workshop")).toBe("/incidents");
    expect(accessGroupHome("parts")).toBe("/admin");
    expect(accessGroupHome("fitter")).toBe("/requests");
  });

  it("keeps page-level checks aligned with the route matrix", () => {
    expect(canUsePage(false, "parts", "/console")).toBe(true);
    expect(canUsePage(false, "parts", "/admin")).toBe(false);
    expect(canUsePage(false, "office", "/console")).toBe(true);
    expect(canUsePage(false, "transport", "/reports")).toBe(true);
    expect(canUsePage(false, "workshop", "/reports")).toBe(true);
    expect(canUsePage(false, "workshop", "/console")).toBe(true);
    expect(canUsePage(false, "fitter", "/console")).toBe(false);
    expect(canUsePage(true, "admin", "/control")).toBe(true);
  });

  it("keeps the Fleet Map in the Fitter permission set", () => {
    expect(canUsePage(false, "fitter", "/fleet")).toBe(true);
    expect(canUsePage(false, "fitter", "/fleet/map")).toBe(true);
    expect(canUsePage(false, "fitter", "/fleet/register")).toBe(false);
  });

  it("keeps Workshop Live Queue access aligned with console navigation", () => {
    const shell = readFileSync(
      resolve(process.cwd(), "components/console/console-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain('"/console": ["workshop", "office", "transport", "parts"]');
    for (const route of ["/assets", "/fleet/register", "/fleet/trips", "/fleet/scheduler", "/assets/inbox"]) {
      expect(shell).toContain(`"${route}": ["workshop", "transport", "office"`);
    }
  });

  it("lets Workshop open individual machine records for reviewed InspHire context", () => {
    expect(canAccessPath("workshop", "/assets/10000000-0000-4000-8000-000000000001")).toBe(true);
  });
});
