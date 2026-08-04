import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  allocateNexusTicketStock,
  fetchNexusMachineCatalogue,
} from "@/lib/integrations/nexus/client";
import { authorizeRicoRoute } from "@/lib/integrations/rico/route-auth";
import { lookupMachineRegistryRecord } from "@/lib/machine-registry";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  fleetNumber: z.string().trim().min(1).max(120),
  lines: z
    .array(
      z.object({
        partId: z.string().uuid(),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
  confirmed: z.literal(true),
});

export async function POST(request: NextRequest) {
  const auth = await authorizeRicoRoute(request);
  if (!auth.ok)
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: "Review the stores request and confirm it again." },
      { status: 400 },
    );

  try {
    const machine = await lookupMachineRegistryRecord(
      auth.supabase,
      parsed.data.fleetNumber,
    );
    if (!machine?.id || !machine.make?.trim() || !machine.model?.trim())
      return NextResponse.json(
        { ok: false, error: "The verified RELAY machine is no longer available." },
        { status: 409 },
      );

    const catalogue = await fetchNexusMachineCatalogue(
      machine.make,
      machine.model,
    );
    const catalogueById = new Map(catalogue.parts.map((part) => [part.id, part]));
    const lines = parsed.data.lines.map((requested) => {
      const part = catalogueById.get(requested.partId);
      if (!part)
        throw new Error(
          "One or more selected parts no longer match this machine.",
        );
      return {
        partId: part.id,
        partNumber: part.partNumber,
        description: part.description,
        manufacturer: part.manufacturer,
        subgroup: part.subgroup,
        quantity: requested.quantity,
        sellPrice: part.sellPrice,
        stockAvailable: part.stockAvailable,
        binLocation: part.binLocation,
        checkedAt: catalogue.checkedAt,
      };
    });

    const { data: ticketResult, error: ticketError } = await auth.supabase.rpc(
      "create_nexus_self_service_ticket",
      {
        p_request_id: parsed.data.requestId,
        p_machine_id: machine.id,
        p_lines: lines,
      },
    );
    if (ticketError || !ticketResult)
      throw new Error(ticketError?.message || "RELAY could not create the ticket.");
    const ticket = ticketResult as { ticketId: string };

    let allocation;
    try {
      allocation = await allocateNexusTicketStock({
        relayTicketId: ticket.ticketId,
        relayTicketReference: ticket.ticketId.slice(0, 8).toUpperCase(),
        fleetNumber: machine.machine_number,
        requestedBy: auth.user.email ?? auth.user.id,
        lines: lines.map((line) => ({
          partId: line.partId,
          quantity: line.quantity,
        })),
      });
    } catch (allocationError) {
      await auth.supabase.from("ticket_updates").insert({
        ticket_id: ticket.ticketId,
        status: "PENDING",
        comment: `NEXUS allocation pending: ${
          allocationError instanceof Error
            ? allocationError.message
            : "connection failed"
        }. Retry the same Stores Self-Service request; stock will not be deducted twice.`,
      });
      return NextResponse.json(
        {
          ok: false,
          ticketId: ticket.ticketId,
          retryable: true,
          error:
            allocationError instanceof Error
              ? allocationError.message
              : "NEXUS allocation failed.",
        },
        { status: 502 },
      );
    }

    const { data: finalResult, error: finalError } = await auth.supabase.rpc(
      "finalize_nexus_self_service_ticket",
      {
        p_request_id: parsed.data.requestId,
        p_allocation_id: allocation.allocationId,
        p_lines: allocation.lines,
      },
    );
    if (finalError || !finalResult)
      throw new Error(
        finalError?.message ||
          "Stock was allocated, but RELAY could not finish the ticket update.",
      );

    return NextResponse.json({
      ok: true,
      data: {
        ...(finalResult as Record<string, unknown>),
        allocationId: allocation.allocationId,
        idempotent: allocation.idempotent,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The Stores Self-Service request failed.",
      },
      { status: 500 },
    );
  }
}
