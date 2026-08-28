import { describe, expect, it } from "vitest";
import {
  buildRicoMachineQueryCandidates,
  buildRicoReferenceCandidates,
  compactRicoReference,
  extractRicoMachineModel,
  getRicoServiceIntervalHours,
  normalizeRicoProduct,
} from "@/lib/integrations/rico/normalizers";
import { ricoProductSchema } from "@/lib/integrations/rico/schemas";

describe("RICO normalisation", () => {
  it("tries the exact reference before a separator-free candidate", () => {
    expect(buildRicoReferenceCandidates(" jcb RFK-509 X ")).toEqual([
      "JCB RFK-509 X",
      "JCBRFK509X",
    ]);
    expect(compactRicoReference(" AB-12 / 3 ")).toBe("AB123");
  });

  it("normalises a documented fictional product payload", () => {
    const parsed = ricoProductSchema.parse({
      id: 12345,
      reference: "FK-DEMO",
      name: "Fictional service kit",
      price: 12.5,
      quantity: "4",
      active: "1",
      features: [{ name: "Model", value: "DEMO-1" }],
      images: [],
    });
    expect(normalizeRicoProduct(parsed)).toMatchObject({
      id: 12345,
      reference: "FK-DEMO",
      price: 12.5,
      quantity: 4,
      active: true,
    });
  });

  it("separates searchable models from fleet descriptions", () => {
    expect(extractRicoMachineModel("TB260 MIDI EXCAVATOR HSR", "TAKEUCHI")).toBe("TB260");
    expect(extractRicoMachineModel("TAKEUCHI TB290-2 MIDI EXCAVATOR", "TAKEUCHI")).toBe("TB290-2");
    expect(extractRicoMachineModel("531-70 TELEHANDLER", "JCB")).toBe("531-70");
    expect(extractRicoMachineModel("JS130 LC EXCAVATOR", "JCB")).toBe("JS130 LC");
    expect(buildRicoMachineQueryCandidates("TB260 MIDI EXCAVATOR")).toEqual([
      "TB260",
      "TB 260",
    ]);
  });

  it("converts RICO product HTML descriptions into readable text", () => {
    const parsed = ricoProductSchema.parse({
      id: 12346,
      reference: "FK-HTML",
      name: "Fictional service kit",
      description_short: "<p>Oil Filter</p><p>Fuel&nbsp;Filter &amp; element</p>",
      price: 20,
      quantity: 2,
      active: 1,
    });
    expect(normalizeRicoProduct(parsed).descriptionShort).toBe(
      "Oil Filter Fuel Filter & element",
    );
    expect(normalizeRicoProduct(parsed).descriptionItems).toEqual([
      "Oil Filter",
      "Fuel Filter & element",
    ]);
  });

  it("maps RICO kit types to RELAY service intervals", () => {
    expect(getRicoServiceIntervalHours("Air/Oil/Fuel")).toBe(500);
    expect(getRicoServiceIntervalHours(" full kit ")).toBe(1000);
    expect(getRicoServiceIntervalHours("Oil only")).toBeNull();
    expect(getRicoServiceIntervalHours(null)).toBeNull();
  });
});
