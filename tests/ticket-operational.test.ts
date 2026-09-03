import { describe, expect, it } from "vitest";
import { getStatusWorkflowRequirement } from "@/lib/ticket-operational";

describe("ticket status workflow requirements", () => {
  it("requires the READY workflow and bin location from every prior status", () => {
    for (const status of ["PENDING", "ESTIMATE", "QUOTE", "QUERY", "IN_PROGRESS", "ORDERED"]) {
      expect(getStatusWorkflowRequirement(status, "READY")).toBe("ready");
    }
  });

  it("does not reopen the workflow when a READY ticket is saved unchanged", () => {
    expect(getStatusWorkflowRequirement("READY", "READY")).toBeNull();
  });
});
