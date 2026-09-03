import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoFleetMachine } from "@/lib/integrations/rico/fleet-client";
import { authorizeRelayRequesterRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

const referenceSchema = z.string().trim().min(1).max(160);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ ref: string }> },
) {
  const auth = await authorizeRelayRequesterRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = referenceSchema.safeParse((await context.params).ref);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid Fleet API machine reference." }, { status: 400 });
  }
  try {
    return NextResponse.json({
      ok: true,
      data: await getRicoFleetMachine(parsed.data, request.signal),
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
