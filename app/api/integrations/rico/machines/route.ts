import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoMachines } from "@/lib/integrations/rico/client";
import { authorizeRelayRequesterRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

const querySchema = z.object({
  manufacturer: z.string().trim().min(1).max(80),
  model: z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).optional(),
  series: z.string().trim().max(100).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await authorizeRelayRequesterRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Select a manufacturer and enter a valid model." }, { status: 400 });
  try {
    return NextResponse.json({
      ok: true,
      data: await getRicoMachines({
        manufacturer: parsed.data.manufacturer,
        model: parsed.data.model,
        query: parsed.data.q,
        series: parsed.data.series,
        signal: request.signal,
      }),
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
