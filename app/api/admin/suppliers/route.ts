import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { buildSupplierDirectoryEntries, type SupplierContactRecord } from "@/lib/supplier-directory";
import { getRelaySessionUserFromRequest } from "@/lib/security";

type SupplierContactUpsertBody = {
  supplierName?: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  preferredContactMethod?: "email" | "phone" | "whatsapp" | "manual" | null;
  workflowStage?: "draft" | "ready" | "emailed" | "whatsapp_sent" | "follow_up" | null;
  notes?: string | null;
  lastContactedAt?: string | null;
};

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return { supabaseUrl, serviceRoleKey };
}

async function getAdminClient(request: NextRequest) {
  const config = getSupabaseConfig();

  if (!config) {
    return { error: "Supabase supplier directory is not configured.", status: 500 as const, supabase: null };
  }

  const user = await getRelaySessionUserFromRequest(request);

  if (!user?.id) {
    return { error: "Authentication is required.", status: 401 as const, supabase: null };
  }

  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
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

export async function GET(request: NextRequest) {
  try {
    const { error, status, supabase } = await getAdminClient(request);

    if (!supabase) {
      return NextResponse.json({ error }, { status });
    }

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
      supabase
        .from("supplier_contacts")
        .select("*")
        .order("updated_at", { ascending: false }),
    ]);

    if (ticketsResult.error) {
      throw new Error(ticketsResult.error.message);
    }

    if (snapshotsResult.error) {
      throw new Error(snapshotsResult.error.message);
    }

    const contactRows = contactsResult.error ? [] : (contactsResult.data ?? []);

    if (contactsResult.error && !isMissingRelationError(contactsResult.error.message)) {
      throw new Error(contactsResult.error.message);
    }

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

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      suppliers: directory.entries,
      supplierOptions: directory.supplierOptions,
      contactsConfigured: !contactsResult.error,
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

    const body = (await request.json().catch(() => ({}))) as SupplierContactUpsertBody;
    const supplierName = body.supplierName?.trim() ?? "";

    if (!supplierName) {
      return NextResponse.json({ error: "Supplier name is required." }, { status: 400 });
    }

    const normalizedSupplierName = supplierName.toLowerCase().replace(/\s+/g, " ");
    const payload = {
      supplier_name: supplierName,
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

    return NextResponse.json({
      ok: true,
      supplier: result.data,
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

function isMissingRelationError(message: string) {
  return /relation .*supplier_contacts.* does not exist/i.test(message);
}
