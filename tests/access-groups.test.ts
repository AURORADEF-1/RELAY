import { describe, expect, it } from "vitest";
import { accessGroupHome, canAccessPath, normalizeAccessGroup } from "@/lib/access-groups";

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
    expect(canAccessPath("workshop", "/admin")).toBe(false);
    expect(canAccessPath("parts", "/parts-knowledge")).toBe(true);
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
});
