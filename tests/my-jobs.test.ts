import { describe, expect, it } from "vitest";
import {
  formatTimeInStatus,
  getDefaultTargetStatus,
  getMyJobsEdgeScrollDelta,
  getMyJobsColumnForStatus,
  getMyJobsColumnTickets,
  isMyJob,
  MY_JOBS_COLUMNS,
  type MyJobTicket,
} from "@/lib/my-jobs";

function buildTicket(overrides: Partial<MyJobTicket> = {}): MyJobTicket {
  return {
    id: "ticket-1",
    user_id: "requester-1",
    requester_name: "Stuart Swatman",
    department: "Workshop",
    machine_reference: "21395",
    machine_number: "21395",
    machine_make: null,
    machine_model: null,
    machine_serial_number: null,
    machine_verified: true,
    job_number: "53722",
    request_summary: "Battery and fuel filter",
    request_details: null,
    status: "PENDING",
    assigned_to: "Samantha",
    expected_delivery_date: null,
    lead_time_note: null,
    supplier_name: null,
    supplier_email: null,
    purchase_order_number: null,
    order_amount: null,
    ordered_at: null,
    ordered_by: null,
    bin_location: null,
    ready_at: null,
    ready_by: null,
    notes: null,
    is_urgent: false,
    is_retail_sale: false,
    retail_sales_reference: null,
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    retail_delivery_method: null,
    retail_delivery_address: null,
    retail_apc_tracking_number: null,
    created_at: "2026-08-11T08:00:00.000Z",
    updated_at: "2026-08-11T09:00:00.000Z",
    latest_note: null,
    ...overrides,
  };
}

describe("My Jobs board", () => {
  it("only matches jobs assigned to the signed-in operator", () => {
    expect(isMyJob(buildTicket(), "Samantha")).toBe(true);
    expect(isMyJob(buildTicket({ assigned_to: "samanthac.admin" }), "Samantha")).toBe(true);
    expect(isMyJob(buildTicket({ assigned_to: "Tom" }), "Samantha")).toBe(false);
    expect(isMyJob(buildTicket({ assigned_to: null }), "Samantha")).toBe(false);
  });

  it("groups estimate and quote into the approved shared column", () => {
    const column = getMyJobsColumnForStatus("QUOTE");
    expect(column?.id).toBe("estimate-quote");
    expect(column ? getDefaultTargetStatus(column) : null).toBe("ESTIMATE");
    expect(column ? getMyJobsColumnTickets([
      buildTicket({ id: "estimate", status: "ESTIMATE" }),
      buildTicket({ id: "quote", status: "QUOTE" }),
      buildTicket({ id: "query", status: "QUERY" }),
    ], column).map((ticket) => ticket.id) : []).toEqual(["estimate", "quote"]);
  });

  it("shows the working stages without a pending column", () => {
    const statuses = MY_JOBS_COLUMNS.flatMap((column) => [...column.statuses]);
    expect(statuses).toEqual([
      "ESTIMATE",
      "QUOTE",
      "QUERY",
      "IN_PROGRESS",
      "ORDERED",
      "READY",
    ]);
  });

  it("scrolls the board when a dragged card reaches either edge", () => {
    expect(getMyJobsEdgeScrollDelta(55, 50, 950)).toBe(-28);
    expect(getMyJobsEdgeScrollDelta(500, 50, 950)).toBe(0);
    expect(getMyJobsEdgeScrollDelta(945, 50, 950)).toBe(28);
  });

  it("reports time from the status-specific timestamp", () => {
    const now = new Date("2026-08-11T12:30:00.000Z").getTime();
    expect(formatTimeInStatus(buildTicket({ status: "ORDERED", ordered_at: "2026-08-11T10:00:00.000Z" }), now)).toBe("2h 30m in status");
    expect(formatTimeInStatus(buildTicket({ status: "READY", ready_at: "2026-08-10T10:00:00.000Z" }), now)).toBe("1d 2h in status");
  });
});
