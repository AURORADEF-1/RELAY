import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildSupplierDirectoryEntries, type SupplierContactRecord } from "@/lib/supplier-directory";
import { getRelaySessionUserFromRequest } from "@/lib/security";
import { canonicalizeSupplierDisplayName, normalizeSupplierName } from "@/lib/suppliers";

type SupplierContactUpsertBody = {
  originalSupplierName?: string;
  supplierName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  preferredContactMethod?: "email" | "phone" | "whatsapp" | "manual" | null;
  workflowStage?: "draft" | "ready" | "emailed" | "whatsapp_sent" | "follow_up" | null;
  notes?: string | null;
  lastContactedAt?: string | null;
};

type SupplierMutationBody = SupplierContactUpsertBody & {
  removeHistoricalData?: boolean;
};

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function getAdminClient(request: NextRequest) {
  const config = getSupabaseConfig();

  if (!config) {
    return { error: "Supabase supplier directory is not configured.", status: 500 as const, supabase: null };
  }

  const user = await getRelaySessionUserFromRequest(request);
  const accessToken = getBearerToken(request);

  if (!user?.id || !accessToken) {
    return { error: "Authentication is required.", status: 401 as const, supabase: null };
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle<{ role?: string | null }>();

  if (profileError) {
    return { error: profileError.message, status: 500 as const, supabase: null };
  }

  if ((profile?.role ?? "").trim().toLowerCase() !== "admin") {
    return { error: "Admin access is required.", status: 403 as const, supabase: null };
  }

  return { error: null, status: 200 as const, supabase };
}

async function loadSupplierDirectory(supabase: SupabaseClient) {
  const [ticketsResult, snapshotsResult, contactsResult] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, job_number, machine_reference, purchase_order_number, request_summary, request_details, ordered_at, expected_delivery_date, order_amount, status, supplier_name, supplier_email, created_at, updated_at",
      )
      .in("status", ["ORDERED", "READY", "COMPLETED"])
      .order("ordered_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("supplier_monthly_spend_snapshots")
      .select("*")
      .order("month_start", { ascending: false })
      .order("total_spend", { ascending: false }),
    supabase.from("supplier_contacts").select("*").order("updated_at", { ascending: false }),
  ]);

  if (ticketsResult.error) {
    throw new Error(ticketsResult.error.message);
  }

  if (snapshotsResult.error) {
    throw new Error(snapshotsResult.error.message);
  }

  if (contactsResult.error) {
    if (!isMissingRelationError(contactsResult.error.message)) {
      throw new Error(contactsResult.error.message);
    }
  }

  const contactRows = contactsResult.error ? [] : (contactsResult.data ?? []);
  const directory = buildSupplierDirectoryEntries({
    tickets: (ticketsResult.data ?? []) as Array<{
      id: string;
      job_number: string | null;
      machine_reference: string | null;
      purchase_order_number: string | null;
      request_summary: string | null;
      request_details: string | null;
      ordered_at: string | null;
      expected_delivery_date: string | null;
      order_amount: number | null;
      status: string | null;
      supplier_name: string | null;
      supplier_email: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>,
    monthlySpendSnapshots: (snapshotsResult.data ?? []) as Array<{
      id?: string;
      month_start: string;
      supplier_name: string;
      supplier_name_normalized: string;
      order_count: number;
      total_spend: number;
      generated_at: string;
    }>,
    contacts: contactRows as SupplierContactRecord[],
  });

  return {
    directory,
    contactsConfigured: !contactsResult.error,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { error, status, supabase } = await getAdminClient(request);

    if (!supabase) {
      return NextResponse.json({ error }, { status });
    }
    const { directory, contactsConfigured } = await loadSupplierDirectory(supabase);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      suppliers: directory.entries,
      supplierOptions: directory.supplierOptions,
      contactsConfigured,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load the supplier directory.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { error, status, supabase } = await getAdminClient(request);

    if (!supabase) {
      return NextResponse.json({ error }, { status });
    }

    const body = (await request.json().catch(() => ({}))) as SupplierMutationBody;
    const supplierName = body.supplierName?.trim() ?? "";
    const originalSupplierName = body.originalSupplierName?.trim() ?? supplierName;

    if (!supplierName) {
      return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    }

    const normalizedSupplierName = normalizeSupplierName(supplierName);
    const originalNormalizedSupplierName = normalizeSupplierName(originalSupplierName);
    const shouldRenameHistoricalData =
      originalNormalizedSupplierName !== normalizedSupplierName && !body.removeHistoricalData;
    const shouldDeleteHistoricalData = body.removeHistoricalData === true;
    const payload = {
      supplier_name: canonicalizeSupplierDisplayName(supplierName),
      supplier_name_normalized: normalizedSupplierName,
      contact_email: body.contactEmail?.trim() || null,
      contact_phone: body.contactPhone?.trim() || null,
      whatsapp_number: body.whatsappNumber?.trim() || null,
      preferred_contact_method: body.preferredContactMethod ?? "manual",
      workflow_stage: body.workflowStage ?? "draft",
      notes: body.notes?.trim() || null,
      last_contacted_at: body.lastContactedAt?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const result = await supabase
      .from("supplier_contacts")
      .upsert(payload, { onConflict: "supplier_name_normalized" })
      .select("*")
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    if (shouldRenameHistoricalData || shouldDeleteHistoricalData) {
      const [ticketsResult, snapshotsResult] = await Promise.all([
        supabase
          .from("tickets")
          .select("id, supplier_name, supplier_email")
          .not("supplier_name", "is", null),
        supabase
          .from("supplier_monthly_spend_snapshots")
          .select("id, supplier_name_normalized")
          .eq("supplier_name_normalized", originalNormalizedSupplierName),
      ]);

      if (ticketsResult.error) {
        throw new Error(ticketsResult.error.message);
      }

      if (snapshotsResult.error) {
        throw new Error(snapshotsResult.error.message);
      }

      const matchingTicketIds = ((ticketsResult.data ?? []) as Array<{
        id: string;
        supplier_name: string | null;
        supplier_email: string | null;
      }>)
        .filter((ticket) => {
          const current = ticket.supplier_name?.trim();

          if (!current) {
            return false;
          }

          return normalizeSupplierName(current) === originalNormalizedSupplierName;
        })
        .map((ticket) => ticket.id);

      if (shouldDeleteHistoricalData) {
        if (matchingTicketIds.length > 0) {
          const { error: ticketUpdateError } = await supabase
            .from("tickets")
            .update({
              supplier_name: null,
              supplier_email: null,
              updated_at: new Date().toISOString(),
            })
            .in("id", matchingTicketIds);

          if (ticketUpdateError) {
            throw new Error(ticketUpdateError.message);
          }
        }

        const { error: snapshotDeleteError } = await supabase
          .from("supplier_monthly_spend_snapshots")
          .delete()
          .eq("supplier_name_normalized", originalNormalizedSupplierName);

        if (snapshotDeleteError) {
          throw new Error(snapshotDeleteError.message);
        }
      } else if (shouldRenameHistoricalData) {
        if (matchingTicketIds.length > 0) {
          const { error: ticketUpdateError } = await supabase
            .from("tickets")
            .update({
              supplier_name: canonicalizeSupplierDisplayName(supplierName),
              updated_at: new Date().toISOString(),
            })
            .in("id", matchingTicketIds);

          if (ticketUpdateError) {
            throw new Error(ticketUpdateError.message);
          }
        }

        const { error: snapshotUpdateError } = await supabase
          .from("supplier_monthly_spend_snapshots")
          .update({
            supplier_name: canonicalizeSupplierDisplayName(supplierName),
            supplier_name_normalized: normalizedSupplierName,
          })
          .eq("supplier_name_normalized", originalNormalizedSupplierName);

        if (snapshotUpdateError) {
          throw new Error(snapshotUpdateError.message);
        }

        if (originalNormalizedSupplierName !== normalizedSupplierName) {
          const { error: oldContactDeleteError } = await supabase
            .from("supplier_contacts")
            .delete()
            .eq("supplier_name_normalized", originalNormalizedSupplierName);

          if (oldContactDeleteError) {
            throw new Error(oldContactDeleteError.message);
          }
        }
      }
    }

    const { directory } = await loadSupplierDirectory(supabase);
    const supplier = directory.entries.find(
      (entry) => entry.normalizedSupplierName === normalizedSupplierName,
    ) ?? null;

    return NextResponse.json({
      ok: true,
      supplier,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to save supplier contact details.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { error, status, supabase } = await getAdminClient(request);

    if (!supabase) {
      return NextResponse.json({ error }, { status });
    }

    const body = (await request.json().catch(() => ({}))) as SupplierMutationBody;
    const supplierName = body.supplierName?.trim() ?? "";

    if (!supplierName) {
      return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    }

    const normalizedSupplierName = normalizeSupplierName(supplierName);
    const payload = {
      supplier_name: canonicalizeSupplierDisplayName(supplierName),
      supplier_name_normalized: normalizedSupplierName,
      contact_email: body.contactEmail?.trim() || null,
      contact_phone: body.contactPhone?.trim() || null,
      whatsapp_number: body.whatsappNumber?.trim() || null,
      preferred_contact_method: body.preferredContactMethod ?? "manual",
      workflow_stage: body.workflowStage ?? "draft",
      notes: body.notes?.trim() || null,
      last_contacted_at: body.lastContactedAt?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const result = await supabase
      .from("supplier_contacts")
      .upsert(payload, { onConflict: "supplier_name_normalized" })
      .select("*")
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    const { directory } = await loadSupplierDirectory(supabase);
    const supplier = directory.entries.find(
      (entry) => entry.normalizedSupplierName === normalizedSupplierName,
    ) ?? null;

    return NextResponse.json({
      ok: true,
      supplier,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create supplier details.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { error, status, supabase } = await getAdminClient(request);

    if (!supabase) {
      return NextResponse.json({ error }, { status });
    }

    const body = (await request.json().catch(() => ({}))) as { supplierName?: string };
    const supplierName = body.supplierName?.trim() ?? "";

    if (!supplierName) {
      return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    }

    const normalizedSupplierName = normalizeSupplierName(supplierName);

    const [ticketsResult, snapshotResult] = await Promise.all([
      supabase
        .from("tickets")
        .select("id, supplier_name")
        .not("supplier_name", "is", null),
      supabase
        .from("supplier_monthly_spend_snapshots")
        .select("id, supplier_name_normalized")
        .eq("supplier_name_normalized", normalizedSupplierName),
    ]);

    if (ticketsResult.error) {
      throw new Error(ticketsResult.error.message);
    }

    if (snapshotResult.error) {
      throw new Error(snapshotResult.error.message);
    }

    const matchingTicketIds = ((ticketsResult.data ?? []) as Array<{ id: string; supplier_name: string | null }>)
      .filter((ticket) => {
        const current = ticket.supplier_name?.trim();

        if (!current) {
          return false;
        }

        return normalizeSupplierName(current) === normalizedSupplierName;
      })
      .map((ticket) => ticket.id);

    if (matchingTicketIds.length > 0) {
      const { error: ticketUpdateError } = await supabase
        .from("tickets")
        .update({
          supplier_name: null,
          supplier_email: null,
          updated_at: new Date().toISOString(),
        })
        .in("id", matchingTicketIds);

      if (ticketUpdateError) {
        throw new Error(ticketUpdateError.message);
      }
    }

    const { error: snapshotDeleteError } = await supabase
      .from("supplier_monthly_spend_snapshots")
      .delete()
      .eq("supplier_name_normalized", normalizedSupplierName);

    if (snapshotDeleteError) {
      throw new Error(snapshotDeleteError.message);
    }

    const { error: contactDeleteError } = await supabase
      .from("supplier_contacts")
      .delete()
      .eq("supplier_name_normalized", normalizedSupplierName);

    if (contactDeleteError) {
      throw new Error(contactDeleteError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete supplier.",
      },
      { status: 500 },
    );
  }
}

function isMissingRelationError(message: string) {
  return /relation .*supplier_contacts.* does not exist/i.test(message);
}
