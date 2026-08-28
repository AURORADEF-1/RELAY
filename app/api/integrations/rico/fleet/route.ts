import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoFleetMachines } from "@/lib/integrations/rico/fleet-client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  serial: z.string().trim().max(160).optional(),
  fleetNumber: z.string().trim().max(120).optional(),
  manufacturer: z.string().trim().max(120).optional(),
  updatedSince: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export async function GET(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Enter a valid Fleet API search." }, { status: 400 });
  }
  try {
    return NextResponse.json({
      ok: true,
      data: await getRicoFleetMachines({
        query: parsed.data.q,
        serial: parsed.data.serial,
        fleetNumber: parsed.data.fleetNumber,
        manufacturer: parsed.data.manufacturer,
        updatedSince: parsed.data.updatedSince,
        limit: parsed.data.limit,
        offset: parsed.data.offset,
        signal: request.signal,
      }),
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
