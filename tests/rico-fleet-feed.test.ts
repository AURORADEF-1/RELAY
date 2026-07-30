import { describe, expect, it } from "vitest";
import {
  authorizeRicoFleetFeed,
  getBearerToken,
} from "@/lib/integrations/rico/feed-auth";
import {
  isUsableRicoFleetSerial,
  normalizeRicoFleetFeedStatus,
  parseRicoFleetFeedQuery,
  toRicoFleetFeedMachine,
} from "@/lib/integrations/rico/feed-types";

const machine = {
  id: "11111111-1111-4111-8111-111111111111",
  machine_number: "24079",
  machine_number_normalized: "24079",
  fleet_type: "excavator",
  item_description: "TAKEUCHI TB260 MIDI EXCAVATOR HSR",
  make: "TAKEUCHI",
  model: "TB260 MIDI EXCAVATOR HSR",
  serial_number: "126109095",
  status: "On Hire",
  engine: "Yanmar 4TNV86CT",
  engine_serial_number: "ENG-260-01",
  build_year: "2024",
  serial_range: "126100001-",
  lifecycle_status: "active" as const,
  current_hours: 1240,
  hours_reading_date: "2026-07-29",
  service_interval_hours: 500,
  service_interval_months: 12,
  location: "Main depot",
  notes: "Engine confirmed from plate.",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-07-29T08:00:00.000Z",
};

describe("RICO outbound fleet feed", () => {
  it("requires the current or previous bearer token", () => {
    expect(getBearerToken("Bearer partner-secret")).toBe("partner-secret");
    expect(authorizeRicoFleetFeed("Bearer partner-secret", "partner-secret")).toBe(true);
    expect(authorizeRicoFleetFeed("Bearer old-secret", "partner-secret", "old-secret")).toBe(true);
    expect(authorizeRicoFleetFeed("Bearer wrong", "partner-secret")).toBe(false);
    expect(authorizeRicoFleetFeed(null, "partner-secret")).toBe(false);
  });

  it("parses bounded pagination and normalises updated_since", () => {
    expect(parseRicoFleetFeedQuery(new URLSearchParams())).toEqual({
      limit: 200,
      offset: 0,
      updatedSince: null,
    });
    expect(
      parseRicoFleetFeedQuery(
        new URLSearchParams("limit=50&offset=100&updated_since=2026-07-01T00:00:00Z"),
      ),
    ).toEqual({
      limit: 50,
      offset: 100,
      updatedSince: "2026-07-01T00:00:00.000Z",
    });
    expect(() => parseRicoFleetFeedQuery(new URLSearchParams("limit=501"))).toThrow();
    expect(() => parseRicoFleetFeedQuery(new URLSearchParams("updated_since=tomorrow"))).toThrow();
  });

  it("exports one physical machine with stable identifiers and cleaned model data", () => {
    expect(toRicoFleetFeedMachine(machine)).toEqual({
      relay_id: machine.id,
      machine_ref: null,
      manufacturer: "TAKEUCHI",
      model: "TB260",
      serial_number: "126109095",
      serial_known: true,
      plant_reference: "24079",
      fleet_number: "24079",
      type: "Excavator",
      engine: "Yanmar 4TNV86CT",
      engine_serial_number: "ENG-260-01",
      year: "2024",
      serial_range: "126100001-",
      status: "active",
      status_detail: "On Hire",
      current_hours: 1240,
      hours_reading_date: "2026-07-29",
      service_interval_hours: 500,
      service_interval_months: 12,
      location: "Main depot",
      notes: "Engine confirmed from plate.",
      description: "TAKEUCHI TB260 MIDI EXCAVATOR HSR",
      created_at: machine.created_at,
      updated_at: machine.updated_at,
    });
  });

  it("keeps lifecycle changes explicit", () => {
    expect(normalizeRicoFleetFeedStatus("Sold")).toBe("sold");
    expect(normalizeRicoFleetFeedStatus("Written off")).toBe("disposed");
    expect(normalizeRicoFleetFeedStatus("Scrap")).toBe("disposed");
    expect(normalizeRicoFleetFeedStatus("Scrapped")).toBe("disposed");
    expect(normalizeRicoFleetFeedStatus("In Repair")).toBe("active");
  });

  it("flags missing and placeholder serials without dropping the machine", () => {
    for (const serial of [null, "", " N/A ", "unknown", "-", "0"]) {
      expect(isUsableRicoFleetSerial(serial)).toBe(false);
    }
    expect(isUsableRicoFleetSerial("ABC-123")).toBe(true);
    expect(toRicoFleetFeedMachine({ ...machine, serial_number: "N/A" })).toMatchObject({
      serial_number: null,
      serial_known: false,
      relay_id: machine.id,
    });
  });
});
