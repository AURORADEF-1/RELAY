import { describe, expect, it } from "vitest";
import {
  buildPreviousReportRange,
  buildReportAnalytics,
  buildReportingPurchaseOrders,
  type ReportRange,
} from "@/lib/report-analytics";
import type {
  RelayAnalyticsPurchaseOrder,
  RelayAnalyticsSnapshot,
  RelayAnalyticsTicket,
} from "@/lib/relay-console-ai";

const july: ReportRange = {
  start: new Date(2026, 6, 1),
  end: new Date(2026, 7, 1),
  label: "July 2026",
};

describe("report purchase ledger", () => {
  it("combines linked purchase orders with legacy ticket fields without double counting", () => {
    const snapshot = buildSnapshot({
      tickets: [
        ticket({
          id: "linked-ticket",
          supplier_name: "RICO",
          purchase_order_number: "LEGACY-PO",
          order_amount: 100,
          ordered_at: "2026-07-03T09:00:00.000Z",
        }),
        ticket({
          id: "legacy-ticket",
          supplier_name: "TVH",
          purchase_order_number: "PO-2",
          order_amount: 50,
          ordered_at: "2026-07-04T09:00:00.000Z",
        }),
        ticket({ id: "no-purchasing" }),
        ticket({
          id: "cancelled-linked-ticket",
          supplier_name: "Fallback must not count",
          order_amount: 30,
          ordered_at: "2026-07-05T09:00:00.000Z",
        }),
      ],
      purchaseOrders: [
        purchaseOrder({
          id: "linked-po",
          ticket_id: "linked-ticket",
          supplier_name: "RICO",
          order_amount: 80,
          created_at: "2026-07-03T10:00:00.000Z",
        }),
        purchaseOrder({
          id: "cancelled-po",
          ticket_id: "cancelled-linked-ticket",
          supplier_name: "Cancelled supplier",
          order_amount: 30,
          po_status: "CANCELLED",
          created_at: "2026-07-05T10:00:00.000Z",
        }),
      ],
    });

    const ledger = buildReportingPurchaseOrders(snapshot);
    expect(ledger).toHaveLength(3);
    expect(ledger.filter((row) => row.source === "legacy-ticket")).toHaveLength(1);

    const analytics = buildReportAnalytics(snapshot, july, []);
    expect(analytics.purchaseOrderCount).toBe(2);
    expect(analytics.purchaseOrderValue).toBe(130);
    expect(analytics.purchaseOrderSourceCounts).toEqual({ linked: 1, legacy: 1 });
    expect(analytics.suppliers.map((supplier) => supplier.label)).toEqual(["RICO", "TVH"]);
  });

  it("uses the previous calendar month for monthly comparisons", () => {
    const previous = buildPreviousReportRange(july);
    expect([
      previous.start.getFullYear(),
      previous.start.getMonth(),
      previous.start.getDate(),
    ]).toEqual([2026, 5, 1]);
    expect([
      previous.end.getFullYear(),
      previous.end.getMonth(),
      previous.end.getDate(),
    ]).toEqual([2026, 6, 1]);
    expect(previous.label).toBe("June 2026");
  });
});

describe("operator period comparison", () => {
  it("compares completion and assignment output with the previous period", () => {
    const snapshot = buildSnapshot({
      tickets: [
        ticket({
          id: "current",
          assigned_to: "Tom",
          created_at: "2026-07-03T09:00:00.000Z",
        }),
        ticket({
          id: "previous",
          assigned_to: "Tom",
          created_at: "2026-06-03T09:00:00.000Z",
        }),
      ],
      completionEvents: [
        { ticket_id: "current", status: "COMPLETED", created_at: "2026-07-05T09:00:00.000Z" },
        { ticket_id: "previous", status: "COMPLETED", created_at: "2026-06-06T09:00:00.000Z" },
      ],
    });

    const analytics = buildReportAnalytics(snapshot, july, ["Tom"]);
    expect(analytics.operators[0]).toMatchObject({
      name: "Tom",
      completed: 1,
      previousCompleted: 1,
      newAssigned: 1,
      previousNewAssigned: 1,
    });
    expect(analytics.operators[0].monthly).toHaveLength(6);
    expect(analytics.previousClosedJobs).toBe(1);
  });
});

describe("master fleet coverage", () => {
  it("includes registry machines even when they have no customer-fleet assignment or ticket", () => {
    const snapshot = buildSnapshot({});
    snapshot.fleetMachines = [{
      id: "machine-1",
      machine_number: "24051",
      machine_number_normalized: "24051",
      fleet_type: "Excavator",
      item_description: "Excavator",
      make: "Takeuchi",
      model: "TB260",
      serial_number: "SERIAL-1",
    }];

    const analytics = buildReportAnalytics(snapshot, july, []);
    expect(analytics.fleetRows).toHaveLength(1);
    expect(analytics.fleetRows[0]).toMatchObject({
      label: "24051",
      health: "Healthy",
    });
  });
});

function buildSnapshot({
  tickets = [],
  purchaseOrders = [],
  completionEvents = [],
}: {
  tickets?: RelayAnalyticsTicket[];
  purchaseOrders?: RelayAnalyticsPurchaseOrder[];
  completionEvents?: RelayAnalyticsSnapshot["completionEvents"];
}): RelayAnalyticsSnapshot {
  return {
    tickets,
    purchaseOrders,
    completionEvents,
    customerFleets: [],
    fleetMachines: [],
    loadedAt: new Date("2026-07-31T09:00:00.000Z"),
    coverage: { queryCount: 0, rowsRead: 0, truncated: [] },
  };
}

function ticket(
  values: Partial<RelayAnalyticsTicket> & Pick<RelayAnalyticsTicket, "id">,
): RelayAnalyticsTicket {
  const { id, ...overrides } = values;
  return {
    id,
    user_id: null,
    requester_name: "Requester",
    department: "Workshop",
    machine_reference: "24051",
    machine_number: null,
    machine_number_normalized: null,
    machine_make: null,
    machine_model: null,
    job_number: id,
    request_summary: "Hydraulic hose leak",
    request_details: null,
    status: "PENDING",
    assigned_to: null,
    expected_delivery_date: null,
    supplier_name: null,
    purchase_order_number: null,
    order_amount: null,
    bin_location: null,
    is_urgent: false,
    is_retail_sale: false,
    customer_name: null,
    created_at: null,
    updated_at: null,
    ordered_at: null,
    ready_at: null,
    notes: null,
    ...overrides,
  };
}

function purchaseOrder(
  values: Partial<RelayAnalyticsPurchaseOrder>
    & Pick<RelayAnalyticsPurchaseOrder, "id" | "ticket_id">,
): RelayAnalyticsPurchaseOrder {
  const { id, ticket_id, ...overrides } = values;
  return {
    id,
    ticket_id,
    supplier_name: "Supplier",
    purchase_order_number: id,
    order_amount: null,
    po_status: "SENT",
    created_at: null,
    ...overrides,
  };
}
