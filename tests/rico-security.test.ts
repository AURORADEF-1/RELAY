import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { isRicoAdmin } from "@/lib/integrations/rico/route-auth";

vi.mock("server-only", () => ({}));

describe("RICO route security", () => {
  it("enforces the existing admin role convention", () => {
    expect(isRicoAdmin({ email: "person@example.test" }, "admin")).toBe(true);
    expect(isRicoAdmin({ email: "person.admin@mlp.local" }, null)).toBe(true);
    expect(isRicoAdmin({ email: "person.user@mlp.local" }, "requester")).toBe(false);
  });

  it("does not expose the RICO key through a public environment name", async () => {
    const files = await Promise.all([
      readFile("lib/integrations/rico/client.ts", "utf8"),
      readFile(".env.example", "utf8"),
    ]);
    expect(files.join("\n")).not.toContain("NEXT_PUBLIC_RICO");
  });
});
