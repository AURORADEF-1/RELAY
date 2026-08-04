import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchNexusMachineCatalogue } from "@/lib/integrations/nexus/client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { lookupMachineRegistryRecord } from "@/lib/machine-registry";

const querySchema = z.object({
  fleetNumber: z.string().trim().min(1).max(120),
});

export async function GET(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok)
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: "Enter a valid RELAY fleet number." },
      { status: 400 },
    );

  try {
    const machine = await lookupMachineRegistryRecord(
      auth.supabase,
      parsed.data.fleetNumber,
    );
    if (!machine)
      return NextResponse.json(
        { ok: false, error: "No verified RELAY machine matched that fleet number." },
        { status: 404 },
      );
    if (!machine.make?.trim() || !machine.model?.trim())
      return NextResponse.json(
        { ok: false, error: "This RELAY machine needs both a make and model before NEXUS can match parts." },
        { status: 409 },
      );

    const catalogue = await fetchNexusMachineCatalogue(
      machine.make,
      machine.model,
    );
    return NextResponse.json({ ok: true, data: { machine, catalogue } });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "NEXUS catalogue lookup failed.",
      },
      { status: 502 },
    );
  }
}
