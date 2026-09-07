import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

// Exercise the page's hooks and timers without a browser or a live database.
const harness = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[],
  tickets: [] as Record<string, unknown>[], collections: [] as unknown[],
  frontCounter: true, spendFails: false, rerender: undefined as undefined | (() => void),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState(initial: unknown) {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = typeof initial === "function" ? initial() : initial;
      return [harness.slots[index], (value: unknown) => {
        harness.slots[index] = typeof value === "function" ? value(harness.slots[index]) : value;
        void Promise.resolve().then(() => harness.rerender?.());
      }];
    },
    useRef(value: unknown) {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: value };
      return harness.slots[index];
    },
    useMemo(fn: () => unknown) { return fn(); },
    useEffect(fn: () => unknown, deps: unknown[]) {
      const index = harness.cursor++;
      const previous = harness.slots[index] as unknown[] | undefined;
      if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
        harness.effects.push(fn);
        harness.slots[index] = deps;
      }
    },
  };
});
vi.mock("@/components/auth-guard", () => ({ AuthGuard: "auth-guard" }));
vi.mock("@/lib/profile-access", () => ({ getCurrentUserWithRole: async () => ({ isFrontCounter: harness.frontCounter }) }));
vi.mock("@/lib/admin-operators", () => ({
  getDefaultAdminOperatorOptions: () => ["Tom"],
  fetchAdminOperatorRecords: async () => [{ name: "Tom" }],
}));
vi.mock("@/lib/front-counter", () => ({
  FRONT_COUNTER_LIVE_CHANNEL: "test",
  fetchFrontCounterCollectionQueue: async () => harness.collections,
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: () => ({
  rpc: async (name: string) => ({
    data: name.endsWith("supplier_spend") ? [] : harness.tickets,
    error: name.endsWith("supplier_spend") && harness.spendFails ? { message: "unavailable" } : null,
  }),
  from: () => {
    const query = {
      select: () => query, in: () => query, order: () => query, not: () => query,
      limit: async () => ({ data: harness.tickets, error: null }),
    };
    return query;
  },
  channel: () => {
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
}) }));
import WallboardPage from "@/app/wallboard/page";

let tree: React.ReactElement;
async function render() {
  harness.cursor = 0;
  tree = WallboardPage();
  const effects = harness.effects.splice(0);
  effects.forEach((effect) => effect());
  await Promise.resolve();
}
async function settle() { for (let i = 0; i < 12; i++) await render(); }
async function advance(seconds: number) {
  await vi.advanceTimersByTimeAsync(seconds * 1000);
  await settle();
}
function content() { return JSON.stringify(tree); }
function screen() {
  const child = (tree.props as { children: React.ReactElement }).children;
  return typeof child.type === "function" ? child.type.name : child.type;
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T08:00:00Z"));
  Object.assign(harness, { slots: [], cursor: 0, effects: [], tickets: [], collections: [], frontCounter: true, spendFails: false });
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { setInterval, clearInterval, setTimeout, clearTimeout });
  vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  harness.rerender = () => { void render(); };
  await settle();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Front Counter wallboard", { timeout: 30000 }, () => {
  it("rotates through every screen despite ten-second data refreshes", async () => {
    expect(content()).toContain("Inbound Queue");
    await advance(60);
    expect(content()).toContain("Ready Queue");
    await advance(60);
    expect(content()).toContain("Admin KPIs");
    await advance(60);
    expect(content()).toContain("Supplier");
    await advance(60);
    expect(content()).toContain("Inbound Queue");
  });
  it("shows unassigned pending work immediately and resumes after assignment", async () => {
    await advance(65);
    harness.tickets = [{ id: "pending", status: "PENDING", assigned_to: null, created_at: "2026-09-07T07:00:00Z" }];
    await advance(10);
    expect(screen()).toBe("PendingJobTakeover");
    await advance(65);
    expect(screen()).toBe("PendingJobTakeover");
    harness.tickets = [];
    await advance(10);
    expect(screen()).toBe("main");
    expect(content()).toContain("Inbound Queue");
    await advance(60);
    expect(content()).toContain("Ready Queue");
  });
  it("preserves collection priority and reveals pending work when collection clears", async () => {
    harness.tickets = [{ id: "pending", status: "PENDING", assigned_to: null }];
    harness.collections = [{ request_id: "collection" }];
    await advance(10);
    expect(screen()).toBe("FrontCounterCollectionTakeover");
    harness.collections = [];
    await advance(10);
    expect(screen()).toBe("PendingJobTakeover");
  });
  it("keeps pending work visible when supplier reporting fails", async () => {
    harness.spendFails = true;
    harness.tickets = [{ id: "pending", status: "PENDING", assigned_to: null }];
    await advance(10);
    expect(screen()).toBe("PendingJobTakeover");
  });
  it("preserves admin rotation", async () => {
    harness.frontCounter = false;
    harness.slots = []; harness.effects = [];
    vi.clearAllTimers();
    await settle();
    expect(content()).toContain("Inbound Queue");
    await advance(60);
    expect(content()).toContain("Ready Queue");
    await advance(60);
    expect(content()).toContain("Admin KPIs");
  });
});
