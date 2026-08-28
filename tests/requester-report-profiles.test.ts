import { describe, expect, it } from "vitest";
import {
  buildRequesterProfiles,
  type ReportRange,
} from "@/lib/report-analytics";
import type { RelayAnalyticsTicket } from "@/lib/relay-console-ai";

const range: ReportRange = {
  start: new Date("2026-07-01T00:00:00.000Z"),
  end: new Date("2026-08-01T00:00:00.000Z"),
  label: "July 2026",
};

describe("requester report profiles", () => {
  it("groups renamed requester tickets by stable user ID", () => {
    const profiles = buildRequesterProfiles(
      [
        ticket({
          id: "ticket-1",
          user_id: "requester-1",
          requester_name: "Dan Shred Station",
          status: "PENDING",
          created_at: "2026-07-10T09:00:00.000Z",
          is_urgent: true,
          machine_reference: "24051",
        }),
        ticket({
          id: "ticket-2",
          user_id: "requester-1",
          requester_name: "danshredstation.user",
          status: "COMPLETED",
          created_at: "2026-06-10T09:00:00.000Z",
          machine_reference: "24051",
        }),
      ],
      range,
      [{ user_id: "requester-1", full_name: "Dan Shred Station" }],
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      key: "user:requester-1",
      name: "Dan Shred Station",
      totalRequests: 2,
      periodRequests: 1,
      openRequests: 1,
      completedRequests: 1,
      urgentRequests: 1,
    });
    expect(profiles[0].machines[0]).toMatchObject({
      label: "24051",
      count: 2,
    });
  });

  it("uses normalized requester names for historic tickets without a user ID", () => {
    const profiles = buildRequesterProfiles(
      [
        ticket({
          id: "ticket-1",
          requester_name: "  Jane   Smith ",
          created_at: "2026-07-05T09:00:00.000Z",
        }),
        ticket({
          id: "ticket-2",
          requester_name: "jane smith",
          created_at: "2026-07-06T09:00:00.000Z",
        }),
      ],
      range,
    );

    expect(profiles).toHaveLength(1);
    expect(profiles[0].key).toBe("name:jane smith");
    expect(profiles[0].totalRequests).toBe(2);
  });
});

function ticket(
  values: Partial<RelayAnalyticsTicket> & Pick<RelayAnalyticsTicket, "id">,
): RelayAnalyticsTicket {
  const { id, ...overrides } = values;
  return {
    id,
    user_id: null,
    requester_name: "Requester",
    department: "Workshop",
    machine_reference: null,
    machine_number: null,
    machine_number_normalized: null,
    machine_make: null,
    machine_model: null,
    job_number: null,
    request_summary: "Test request",
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
