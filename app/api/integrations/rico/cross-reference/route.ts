import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoCrossReference } from "@/lib/integrations/rico/client";
import { buildRicoReferenceCandidates } from "@/lib/integrations/rico/normalizers";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

const querySchema = z.object({ q: z.string().trim().min(2).max(120) });

export async function GET(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Enter a valid part reference." }, { status: 400 });
  try {
    const candidates = buildRicoReferenceCandidates(parsed.data.q);
    let result = await getRicoCrossReference(candidates[0], request.signal);
    let matchedQuery = candidates[0];
    if (result.products.length === 0 && candidates[1]) {
      result = await getRicoCrossReference(candidates[1], request.signal);
      matchedQuery = candidates[1];
    }
    return NextResponse.json({
      ok: true,
      data: { ...result, enteredReference: parsed.data.q, matchedQuery },
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
