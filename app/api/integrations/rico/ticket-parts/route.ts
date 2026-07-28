import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizeMachineNumber } from "@/lib/machine-registry";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";

const bodySchema = z.object({
  ticketId: z.string().uuid(),
  machineId: z.string().uuid().nullable().optional(),
  machineReference: z.string().trim().min(1).max(120),
  machineMake: z.string().trim().max(120).nullable().optional(),
  machineModel: z.string().trim().max(120).nullable().optional(),
  machineSerialNumber: z.string().trim().max(160).nullable().optional(),
  searchMethod: z.enum(["MACHINE", "RICO_REFERENCE", "CROSS_REFERENCE", "CATALOGUE"]),
  productId: z.number().int().positive(),
  partNumber: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().min(1).max(999),
  unitPrice: z.number().min(0),
  currency: z.string().trim().length(3).default("GBP"),
  stockQuantity: z.number().int(),
  internalDescription: z.string().trim().max(1_000).nullable().optional(),
  checkedAt: z.string().datetime(),
  confirmed: z.literal(true),
});

export async function POST(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Review the proposed part details and confirmation." }, { status: 400 });
  }

  const payload = parsed.data;
  const { data: ticket, error: ticketError } = await auth.supabase
    .from("tickets")
    .select("id, job_number")
    .eq("id", payload.ticketId)
    .maybeSingle<{ id: string; job_number: string | null }>();
  if (ticketError || !ticket) {
    return NextResponse.json({ ok: false, error: "The selected open ticket is unavailable." }, { status: 404 });
  }

  const confirmationTime = new Date().toISOString();
  const notes = [
    payload.internalDescription,
    `Proposed from RICO Live. Checked ${payload.checkedAt}. Stock snapshot: ${payload.stockQuantity}.`,
  ].filter(Boolean).join("\n");

  const { data: part, error: partError } = await auth.supabase
    .from("ticket_parts")
    .insert({
      ticket_id: ticket.id,
      created_by: auth.user.id,
      updated_by: auth.user.id,
      job_number: ticket.job_number,
      machine_reference: payload.machineReference,
      machine_number_normalized: normalizeMachineNumber(payload.machineReference),
      machine_make: payload.machineMake ?? null,
      machine_model: payload.machineModel ?? null,
      part_description: payload.description,
      part_number: payload.partNumber,
      quantity: payload.quantity,
      part_status: "REQUESTED",
      supplier_name: "RICO Europe",
      notes,
      source_system: "RICO",
      source_product_id: String(payload.productId),
      source_price_snapshot: payload.unitPrice,
      source_currency: payload.currency,
      source_stock_snapshot: payload.stockQuantity,
      source_checked_at: payload.checkedAt,
      source_search_method: payload.searchMethod,
      source_machine_id: payload.machineId ?? null,
      source_machine_serial_number: payload.machineSerialNumber ?? null,
      source_confirmed_by: auth.user.id,
      source_confirmed_at: confirmationTime,
    })
    .select("id")
    .single<{ id: string }>();

  if (partError || !part) {
    return NextResponse.json({ ok: false, error: "Unable to add the proposed RICO part." }, { status: 500 });
  }

  await auth.supabase.from("ticket_updates").insert({
    ticket_id: ticket.id,
    comment: `Proposed RICO part ${payload.partNumber} added after operator confirmation. Live price and stock were checked at ${payload.checkedAt}.`,
  });

  return NextResponse.json({ ok: true, data: { id: part.id, confirmedAt: confirmationTime } });
}
