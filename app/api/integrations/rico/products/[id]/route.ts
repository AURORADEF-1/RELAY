import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoProduct } from "@/lib/integrations/rico/client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = z.coerce.number().int().positive().safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid RICO product identifier." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, data: await getRicoProduct(parsed.data, request.signal) });
  } catch (error) {
    return ricoRouteError(error);
  }
}
