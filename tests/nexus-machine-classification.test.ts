import { describe, expect, it } from "vitest";
import { classifyMachineForNexus } from "@/lib/integrations/nexus/machine-classification";

describe("classifyMachineForNexus", () => {
  it("extracts the catalogue model from a Takeuchi fleet description", () => {
    expect(
      classifyMachineForNexus({
        make: "TAKEUCHI",
        model: "TB290-2 MINI EXCAVATOR",
        item_description: "TAKEUCHI TB290-2 MINI EXCAVATOR",
      }),
    ).toEqual({ manufacturer: "Takeuchi", model: "TB290-2" });
  });

  it("preserves short uppercase manufacturer names", () => {
    expect(
      classifyMachineForNexus({
        make: "JCB",
        model: "540-170 TELEHANDLER",
      }),
    ).toEqual({ manufacturer: "JCB", model: "540-170" });
  });

  it("falls back to the item description when split fields are absent", () => {
    expect(
      classifyMachineForNexus({
        item_description: "KUBOTA KX080-4 EXCAVATOR",
      }),
    ).toEqual({ manufacturer: "Kubota", model: "KX080-4" });
  });
});
