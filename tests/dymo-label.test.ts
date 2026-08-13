import { describe, expect, it } from "vitest";
import {
  buildDymoJobLabelXml,
  formatDymoReadyAt,
  normalizeDymoPrinters,
  selectDymoLabelWriter,
} from "@/lib/dymo-label";

describe("DYMO job labels", () => {
  it("encodes the Relay value as a Code 39 barcode and escapes XML", () => {
    const xml = buildDymoJobLabelXml("53066 & urgent");

    expect(xml).toContain("<BarcodeFormat>Code39</BarcodeFormat>");
    expect(xml).toContain("<DataString>53066 &amp; urgent</DataString>");
    expect(xml).toContain("<TextPosition>None</TextPosition>");
    expect(xml).toContain("<Name>JOB_NUMBER_BARCODE</Name>");
    expect(xml).toContain("<Name>JOB_NUMBER_TEXT</Name>");
    expect(xml).toContain("<Text>53066 &amp; urgent</Text>");
    expect(xml).toContain("<DYMOPoint><X>0.3</X><Y>0.84</Y></DYMOPoint>");
    expect(xml).toContain("<Size><Width>2.28</Width><Height>0.31</Height></Size>");
    expect(xml).toContain("<FontSize>12</FontSize>");
    expect(xml).toContain("<IsBold>True</IsBold>");
    expect(xml).toContain("<LabelName>Large Address Labels</LabelName>");
    expect(xml).toContain("<Size><Width>3.21</Width><Height>1.286</Height></Size>");
  });

  it("prints the approved job, requester and ready-time hierarchy", () => {
    const xml = buildDymoJobLabelXml({
      barcodeValue: "RLY-ABCDEF1234567890",
      jobNumber: "TEST-20260811",
      requestedBy: "George & Samantha",
      readyAt: "2026-08-12T09:42:00.000Z",
    });

    expect(xml).toContain("<DataString>RLY-ABCDEF1234567890</DataString>");
    expect(xml).toContain("<Name>RELAY_HEADER</Name>");
    expect(xml).toContain("<Text>PARTS READY</Text>");
    expect(xml).toContain("<Text>TEST-20260811</Text>");
    expect(xml).toContain("<Name>REQUESTED_BY_TEXT</Name>");
    expect(xml).toContain("<Text>George &amp; Samantha</Text>");
    expect(xml).toContain("<Name>READY_AT_TEXT</Name>");
    expect(xml).toContain("<Text>12 Aug 2026 · 10:42</Text>");
  });

  it("formats READY timestamps in the RELAY Europe/London timezone", () => {
    expect(formatDymoReadyAt("2026-12-12T10:42:00.000Z")).toBe("12 Dec 2026 · 10:42");
    expect(formatDymoReadyAt(null)).toBe("Not recorded");
  });

  it("uses and escapes the exact consumable name reported by a LabelWriter 550", () => {
    const xml = buildDymoJobLabelXml("53066", "Large Address & Mailing Labels");

    expect(xml).toContain("<LabelName>Large Address &amp; Mailing Labels</LabelName>");
  });

  it("prefers a configured connected printer, then a connected LabelWriter 550", () => {
    const printers = [
      { name: "Office DYMO", modelName: "LabelWriter 450", printerType: "LabelWriterPrinter", isConnected: true },
      { name: "Stores 550", modelName: "LabelWriter 550", printerType: "LabelWriterPrinter", isConnected: true },
    ];

    expect(selectDymoLabelWriter(printers, "Office DYMO")?.name).toBe("Office DYMO");
    expect(selectDymoLabelWriter(printers)?.name).toBe("Stores 550");
  });

  it("normalizes the framework's indexed printer collection", () => {
    expect(normalizeDymoPrinters({ byIndex: [{ name: "Stores 550" }] })).toEqual([
      { name: "Stores 550" },
    ]);
  });

  it("ignores a stale disconnected printer and selects its connected Windows copy", () => {
    const printers = [
      { name: "DYMO LabelWriter 550 Turbo", modelName: "LabelWriter 550 Turbo", printerType: "LabelWriterPrinter", isConnected: false },
      { name: "DYMO LabelWriter 550 Turbo (Copy 1)", modelName: "LabelWriter 550 Turbo", printerType: "LabelWriterPrinter", isConnected: true },
    ];

    expect(selectDymoLabelWriter(printers, "DYMO LabelWriter 550 Turbo")?.name).toBe(
      "DYMO LabelWriter 550 Turbo (Copy 1)",
    );
  });
});
