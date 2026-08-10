import { describe, expect, it } from "vitest";
import {
  buildDymoJobLabelXml,
  normalizeDymoPrinters,
  selectDymoLabelWriter,
} from "@/lib/dymo-label";

describe("DYMO job labels", () => {
  it("encodes the Relay job number as a Code 128 barcode and escapes XML", () => {
    const xml = buildDymoJobLabelXml("53066 & urgent");

    expect(xml).toContain("<BarcodeFormat>Code128Auto</BarcodeFormat>");
    expect(xml).toContain("<DataString>53066 &amp; urgent</DataString>");
    expect(xml).toContain("<TextPosition>Bottom</TextPosition>");
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
});
