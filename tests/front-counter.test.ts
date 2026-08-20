import { describe, expect, it } from "vitest";
import { normalizeFrontCounterIdentifier } from "@/lib/front-counter";

describe("front counter identifiers", () => {
  it("normalizes job and verbal collection codes", () => {
    expect(normalizeFrontCounterIdentifier(" 53904 ")).toBe("53904");
    expect(normalizeFrontCounterIdentifier(" ab23cd ")).toBe("AB23CD");
  });

  it("extracts a RELAY label token from keyboard-scanner wrappers", () => {
    expect(normalizeFrontCounterIdentifier("scan:RLY-ABC12345:end")).toBe("RLY-ABC12345");
  });

  it("does not silently reinterpret unknown content", () => {
    expect(normalizeFrontCounterIdentifier("not a relay code")).toBe("NOT A RELAY CODE");
  });
});
