import { describe, expect, it } from "vitest";
import {
  buildRicoReferenceCandidates,
  compactRicoReference,
  normalizeRicoProduct,
} from "@/lib/integrations/rico/normalizers";
import { ricoProductSchema } from "@/lib/integrations/rico/schemas";

describe("RICO normalisation", () => {
  it("tries the exact reference before a separator-free candidate", () => {
    expect(buildRicoReferenceCandidates(" jcb RFK-509 X ")).toEqual([
      "JCB RFK-509 X",
      "JCBRFK509X",
    ]);
    expect(compactRicoReference(" AB-12 / 3 ")).toBe("AB123");
  });

  it("normalises a documented fictional product payload", () => {
    const parsed = ricoProductSchema.parse({
      id: 12345,
      reference: "FK-DEMO",
      name: "Fictional service kit",
      price: 12.5,
      quantity: "4",
      active: "1",
      features: [{ name: "Model", value: "DEMO-1" }],
      images: [],
    });
    expect(normalizeRicoProduct(parsed)).toMatchObject({
      id: 12345,
      reference: "FK-DEMO",
      price: 12.5,
      quantity: 4,
      active: true,
    });
  });
});
