import { describe, expect, it } from "vitest";
import {
  formatOutstandingTicketParts,
  getOutstandingTicketParts,
  getTicketPartOutstandingQuantity,
  type TicketPartRecord,
} from "@/lib/ticket-parts";

function buildPart(
  overrides: Partial<TicketPartRecord> & Pick<TicketPartRecord, "id" | "part_number">,
): TicketPartRecord {
  return {
    id: overrides.id,
    ticket_id: "ticket-1",
    ticket_purchase_order_id: "po-1",
    created_by: null,
    updated_by: null,
    job_number: "53066",
    machine_reference: "24147",
    machine_number_normalized: "24147",
    machine_make: "Takeuchi",
    machine_model: "TB216",
    part_description: "Test part",
    part_number: overrides.part_number,
    quantity: 1,
    received_quantity: 0,
    received_at: null,
    received_by: null,
    part_status: "REQUESTED",
    supplier_name: null,
    notes: null,
    source_system: null,
    source_product_id: null,
    source_price_snapshot: null,
    source_currency: null,
    source_stock_snapshot: null,
    source_checked_at: null,
    source_bin_location: null,
    source_subgroup: null,
    source_requested_quantity: null,
    source_issued_quantity: null,
    source_shortfall_quantity: null,
    source_stock_after: null,
    source_allocation_status: null,
    created_at: "2026-08-10T08:00:00.000Z",
    updated_at: "2026-08-10T08:00:00.000Z",
    ...overrides,
  };
}

describe("ticket part receiving", () => {
  it("tracks the outstanding balance for a partial delivery", () => {
    const part = buildPart({
      id: "part-1",
      part_number: "PN-1111",
      quantity: 7,
      received_quantity: 3,
    });

    expect(getTicketPartOutstandingQuantity(part)).toBe(4);
    expect(formatOutstandingTicketParts([part])).toBe("4 x PN-1111");
  });

  it("excludes fully received and cancelled lines from the outstanding list", () => {
    const partial = buildPart({
      id: "part-1",
      part_number: "FILTER-1",
      quantity: 4,
      received_quantity: 1,
    });
    const complete = buildPart({
      id: "part-2",
      part_number: "BELT-2",
      quantity: 2,
      received_quantity: 2,
    });
    const cancelled = buildPart({
      id: "part-3",
      part_number: "CAP-3",
      quantity: 5,
      received_quantity: 0,
      part_status: "CANCELLED",
    });

    expect(getOutstandingTicketParts([partial, complete, cancelled])).toEqual([partial]);
    expect(formatOutstandingTicketParts([partial, complete, cancelled])).toBe("3 x FILTER-1");
  });
});
