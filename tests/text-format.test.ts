import { describe, expect, it } from "vitest";
import { formatEnteredTitle } from "@/lib/text-format";

describe("formatEnteredTitle", () => {
  it("applies title case to a lower-case title", () => {
    expect(formatEnteredTitle("lift ram seal kit")).toBe("Lift Ram Seal Kit");
  });

  it("preserves acronyms and model codes", () => {
    expect(formatEnteredTitle("DPF filter for JCB 3CX")).toBe("DPF Filter For JCB 3CX");
  });

  it("capitalises the first letter after leading punctuation", () => {
    expect(formatEnteredTitle('\"oil seal\"')).toBe('\"Oil Seal\"');
  });

  it("trims surrounding whitespace", () => {
    expect(formatEnteredTitle("  hydraulic hose  ")).toBe("Hydraulic Hose");
  });
});
