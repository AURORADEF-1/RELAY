import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getRicoFleetMachine,
  getRicoFleetMachines,
} from "@/lib/integrations/rico/fleet-client";
import { authorizeRelayRequesterRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";
import { lookupMachineRegistryRecord } from "@/lib/machine-registry";
import {
  buildRelayAiFilterAnswer,
  chooseRelayAiFleetMachine,
  relayAiFilterKinds,
} from "@/lib/relay-ai-filter-fitment";

const querySchema = z.object({
  machine: z.string().trim().min(1).max(120),
  filter: z.enum(relayAiFilterKinds),
});

export async function GET(request: NextRequest) {
  const auth = await authorizeRelayRequesterRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid machine reference and filter type." },
      { status: 400 },
    );
  }

  try {
    const machine = await lookupMachineRegistryRecord(auth.supabase, parsed.data.machine);
    if (!machine) {
      return NextResponse.json({
        ok: true,
        data: {
          text: `Machine ${parsed.data.machine} was not found in the verified RELAY machine registry. Check the plant reference before requesting filter fitment.`,
          facts: ["Machine not verified", "RICO not queried"],
          sourceNote: "Exact normalized lookup against the live RELAY machine registry.",
        },
      });
    }

    const searches = [
      { fleetNumber: machine.machine_number, limit: 25 },
      ...(machine.serial_number ? [{ serial: machine.serial_number, limit: 25 }] : []),
      { query: machine.machine_number, limit: 25 },
    ];
    let match = null;
    for (const search of searches) {
      const page = await getRicoFleetMachines(search);
      match = chooseRelayAiFleetMachine(
        page.machines,
        machine.machine_number,
        machine.serial_number,
      );
      if (match) break;
    }

    if (!match) {
      const label = [machine.make, machine.model].filter(Boolean).join(" ")
        || machine.item_description;
      return NextResponse.json({
        ok: true,
        data: {
          text: `Machine ${machine.machine_number} is verified in RELAY as ${label}, but it was not found in RICO Fleet Manager. I cannot confirm a fitted filter from the live fleet catalogue.`,
          facts: ["RELAY machine verified", "No RICO Fleet match"],
          sourceNote: "Bounded exact fleet-number and serial lookup. No substitute machine was used.",
        },
      });
    }

    const detail = await getRicoFleetMachine(match.machineRef || match.id);
    return NextResponse.json({
      ok: true,
      data: buildRelayAiFilterAnswer(detail, {
        machineReference: machine.machine_number,
        filterKind: parsed.data.filter,
      }),
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
