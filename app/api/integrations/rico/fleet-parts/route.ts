import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoFleetParts } from "@/lib/integrations/rico/fleet-client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

const querySchema = z.object({
  includeOils: z.enum(["0", "1"]).default("0"),
});

export async function GET(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid Fleet API parts request." }, { status: 400 });
  }
  try {
    return NextResponse.json({
      ok: true,
      data: await getRicoFleetParts(parsed.data.includeOils === "1", request.signal),
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
