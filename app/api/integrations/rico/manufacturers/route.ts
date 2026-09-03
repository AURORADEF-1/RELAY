import { NextRequest, NextResponse } from "next/server";
import { getRicoManufacturers } from "@/lib/integrations/rico/client";
import { authorizeRelayRequesterRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

export async function GET(request: NextRequest) {
  const auth = await authorizeRelayRequesterRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json({ ok: true, data: await getRicoManufacturers(request.signal) });
  } catch (error) {
    return ricoRouteError(error);
  }
}
