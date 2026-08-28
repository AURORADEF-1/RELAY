import { describe, expect, it } from "vitest";
import type { RicoFleetMachineDetail } from "@/lib/integrations/rico/fleet-types";
import {
  buildRelayAiFilterAnswer,
  chooseRelayAiFleetMachine,
  parseRelayAiFilterQuestion,
} from "@/lib/relay-ai-filter-fitment";

const detail: RicoFleetMachineDetail = {
  customer: "Fictional Fleet",
  machine: {
    id: "machine-demo",
    machineRef: "24079",
    label: "TAKEUCHI TB260",
    manufacturer: "TAKEUCHI",
    model: "TB260",
    type: "Excavator",
    engine: null,
    year: null,
    serialNumber: "126109095",
    fleetNumber: "24079",
    quantity: 1,
    currentHours: null,
    serviceIntervalHours: 500,
    serviceIntervalMonths: null,
    imageUrl: null,
    filterCount: 2,
    units: [{ position: 1, serialNumber: "126109095", fleetNumber: "24079", currentHours: null }],
    updatedAt: null,
  },
  units: [{ position: 1, serialNumber: "126109095", fleetNumber: "24079", currentHours: null }],
  filters: [
    {
      partNumber: "RICO-OIL-1",
      description: "Engine oil filter",
      filterType: "oil",
      category: "Engine",
      quantity: 1,
      bin: null,
      isOem: false,
      verified: true,
      price: 12.5,
      priceSource: "account",
      freeStock: 8,
      manufacturerStock: null,
      inCatalogue: true,
      catalogueDescription: null,
      imageUrl: null,
    },
    {
      partNumber: "RICO-HYD-1",
      description: "Hydraulic oil filter",
      filterType: "hydraulic",
      category: "Hydraulic",
      quantity: 1,
      bin: null,
      isOem: false,
      verified: false,
      price: null,
      priceSource: null,
      freeStock: null,
      manufacturerStock: null,
      inCatalogue: true,
      catalogueDescription: null,
      imageUrl: null,
    },
  ],
  oils: [],
  kits: [{
    kitPartNumber: "KIT-1000",
    serviceInterval: "1000h",
    coverage: "Full kit",
    source: "rico",
    price: 80,
    priceSource: "account",
    freeStock: 2,
    inCatalogue: true,
    filters: [{ partNumber: "RICO-FUEL-1", description: "Fuel filter" }],
  }],
  checkedAt: "2026-07-30T10:00:00.000Z",
};

describe("RELAY AI RICO filter fitment", () => {
  it.each([
    ["What is the oil filter for machine 24079?", "24079", "oil"],
    ["Which fuel filters fit 24079?", "24079", "fuel"],
    ["Show all filters fitted to plant number 24079", "24079", "all"],
    ["What service kit fits fleet 24079?", "24079", "service-kit"],
  ] as const)("parses %s", (question, machineReference, filterKind) => {
    expect(parseRelayAiFilterQuestion(question)).toEqual({ machineReference, filterKind });
  });

  it("does not intercept a non-filter machine question", () => {
    expect(parseRelayAiFilterQuestion("Show machine 24079 make and serial")).toBeNull();
  });

  it("chooses only an exact fleet or serial match", () => {
    expect(chooseRelayAiFleetMachine([detail.machine], "24079")?.id).toBe("machine-demo");
    expect(chooseRelayAiFleetMachine([detail.machine], "99999")).toBeNull();
  });

  it("returns the exact oil filter without including hydraulic oil filters", () => {
    const answer = buildRelayAiFilterAnswer(detail, {
      machineReference: "24079",
      filterKind: "oil",
    });
    expect(answer.text).toContain("RICO-OIL-1");
    expect(answer.text).toContain("verified by RICO");
    expect(answer.text).not.toContain("RICO-HYD-1");
  });

  it("labels kit-only matches as not independently verified", () => {
    const answer = buildRelayAiFilterAnswer(detail, {
      machineReference: "24079",
      filterKind: "fuel",
    });
    expect(answer.text).toContain("RICO-FUEL-1");
    expect(answer.text).toContain("not independently verified standalone fitment");
  });
});
