import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearCurrentUserWithRoleCache,
  getCurrentUserWithRole,
} from "@/lib/profile-access";

describe("RELAY profile access", () => {
  beforeEach(() => {
    clearCurrentUserWithRoleCache();
  });

  it("coalesces simultaneous fresh identity lookups", async () => {
    const getUser = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        data: {
          user: {
            id: "user-1",
            email: "operator.user@mlp.local",
          },
        },
        error: null,
      };
    });
    const maybeSingle = vi.fn(async () => ({
      data: {
        role: "user",
        full_name: "Operator",
        interface_mode: "standard",
      },
      error: null,
    }));
    const supabase = {
      auth: { getUser },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    } as unknown as SupabaseClient;

    const [first, second] = await Promise.all([
      getCurrentUserWithRole(supabase, { forceFresh: true }),
      getCurrentUserWithRole(supabase, { forceFresh: true }),
    ]);

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.user?.id).toBe("user-1");
  });
});
