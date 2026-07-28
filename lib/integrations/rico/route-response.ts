import { NextResponse } from "next/server";
import { getRicoUserMessage, RicoApiError } from "@/lib/integrations/rico/errors";

export function ricoRouteError(error: unknown) {
  const status = error instanceof RicoApiError ? error.status : 500;
  return NextResponse.json(
    { ok: false, error: getRicoUserMessage(error) },
    { status: status >= 400 && status <= 599 ? status : 500 },
  );
}
