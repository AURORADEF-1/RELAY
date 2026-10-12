import {describe, expect, it} from "vitest";
import {buildPartsJobReportRows} from "@/lib/parts-job-report";

describe("Parts Control job status report", () => {
  it("includes ageing and ready-bin fields and sorts old jobs first", () => {
    const now = Date.parse("2026-10-12T12:00:00Z");
    const rows = buildPartsJobReportRows([
      {job_number: "NEW", status: "PENDING", created_at: "2026-10-10T12:00:00Z"},
      {job_number: "OLD", status: "READY", created_at: "2026-09-01T12:00:00Z", ready_at: "2026-10-01T12:00:00Z", bin_location: "A-12"},
    ], now);
    expect(rows[0]).toMatchObject({"Job Number": "OLD", "Age (Days)": 41, "Over 30 Days": "Yes", "Ready Bin": "A-12"});
    expect(rows[1]["Over 30 Days"]).toBe("No");
  });

  it("neutralises spreadsheet formulas in user-entered text", () => {
    const [row] = buildPartsJobReportRows([{job_number: "=1+1", request_summary: "+CMD"}]);
    expect(row["Job Number"]).toBe("'=1+1");
    expect(row.Summary).toBe("'+CMD");
  });
});
