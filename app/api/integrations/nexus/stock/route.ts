import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchNexusMachineCatalogue } from "@/lib/integrations/nexus/client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";

const querySchema = z.object({
  ticketId: z.string().uuid(),
  partNumber: z.string().trim().min(1).max(160),
});

function normalizePartNumber(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function GET(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid linked part number." },
      { status: 400 },
    );
  }

  const { data: ticket, error: ticketError } = await auth.supabase
    .from("tickets")
    .select("id,machine_make,machine_model,machine_serial_number")
    .eq("id", parsed.data.ticketId)
    .maybeSingle<{
      id: string;
      machine_make: string | null;
      machine_model: string | null;
      machine_serial_number: string | null;
    }>();

  if (ticketError) {
    return NextResponse.json(
      { ok: false, error: "RELAY could not verify this ticket." },
      { status: 500 },
    );
  }

  if (!ticket?.machine_make?.trim() || !ticket.machine_model?.trim()) {
    return NextResponse.json({
      ok: true,
      data: {
        found: false,
        reason: "Verify the ticket machine make and model to check NEXUS stock. Manual entry is still available.",
      },
    });
  }

  try {
    const catalogue = await fetchNexusMachineCatalogue(
      ticket.machine_make.trim(),
      ticket.machine_model.trim(),
      ticket.machine_serial_number,
    );
    const requestedPartNumber = normalizePartNumber(parsed.data.partNumber);
    const part = catalogue.parts.find(
      (candidate) => normalizePartNumber(candidate.partNumber) === requestedPartNumber,
    );

    return NextResponse.json({
      ok: true,
      data: part
        ? { found: true, part, checkedAt: catalogue.checkedAt }
        : {
            found: false,
            checkedAt: catalogue.checkedAt,
            reason: "NEXUS did not return this part number for the verified machine. You can still add it manually.",
          },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `${error.message} Manual entry is still available.`
            : "NEXUS stock could not be checked. Manual entry is still available.",
      },
      { status: 502 },
    );
  }
}
