import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRicoProducts } from "@/lib/integrations/rico/client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { ricoRouteError } from "@/lib/integrations/rico/route-response";

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  count: z.coerce.number().int().min(1).max(200).default(50),
  inclTax: z.enum(["0", "1"]).default("0"),
});

export async function GET(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid product search parameters." }, { status: 400 });
  try {
    return NextResponse.json({
      ok: true,
      data: await getRicoProducts({
        offset: parsed.data.offset,
        count: parsed.data.count,
        includeTax: parsed.data.inclTax === "1",
        signal: request.signal,
      }),
    });
  } catch (error) {
    return ricoRouteError(error);
  }
}
