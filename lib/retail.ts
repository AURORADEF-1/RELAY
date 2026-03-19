import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_MONTHLY_RETAIL_TARGET = 30_000;

export type RetailOwner = {
  id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
};

export type RetailLead = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  customer_name: string | null;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  request_summary: string | null;
  request_details: string | null;
  source: string | null;
  pipeline_stage: string | null;
  lead_status: string | null;
  assigned_user_id: string | null;
  estimated_value: number | null;
  quote_value: number | null;
  quote_reference: string | null;
  quote_status: string | null;
  quote_valid_until: string | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  sale_amount: number | null;
  notes: string | null;
};

export type RetailQuote = {
  id: string;
  lead_id: string | null;
  created_at: string | null;
  quote_reference: string | null;
  status: string | null;
  total_value: number | null;
  valid_until: string | null;
  assigned_user_id: string | null;
};

export type RetailSale = {
  id: string;
  lead_id: string | null;
  assigned_user_id: string | null;
  amount: number | null;
  closed_at: string | null;
};

export type RetailTarget = {
  month_key: string;
  target_amount: number | null;
};

export type RetailActivity = {
  id: string;
  lead_id: string | null;
  activity_type: string | null;
  activity_text: string | null;
  created_by: string | null;
  created_at: string | null;
};

export type RetailSnapshot = {
  leads: RetailLead[];
  quotes: RetailQuote[];
  sales: RetailSale[];
  owners: RetailOwner[];
  targets: RetailTarget[];
  setupRequired: boolean;
};

export type RetailDashboardMetrics = {
  activePipelineValue: number;
  quotedValue: number;
  wonThisMonth: number;
  monthTarget: number;
  monthProgress: number;
  openLeads: number;
  overdueQuotes: number;
  weeklySales: number;
  monthlySales: number;
  yearlySales: number;
  stageBreakdown: Array<{ stage: string; count: number; value: number }>;
  ownerBreakdown: Array<{
    ownerId: string | null;
    ownerName: string;
    openLeads: number;
    quoteValue: number;
    wonValue: number;
  }>;
};

export function isMissingRetailTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeCode = "code" in error ? error.code : null;
  const maybeMessage = "message" in error ? error.message : null;

  return (
    maybeCode === "42P01" ||
    (typeof maybeMessage === "string" &&
      maybeMessage.toLowerCase().includes("relation") &&
      maybeMessage.toLowerCase().includes("retail"))
  );
}

export async function fetchRetailOwners(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, role")
    .eq("role", "admin")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RetailOwner[]).map((owner) => ({
    id: owner.id,
    full_name: owner.full_name ?? null,
    username: owner.username ?? null,
    role: owner.role ?? null,
  }));
}

export async function fetchRetailSnapshot(supabase: SupabaseClient): Promise<RetailSnapshot> {
  const owners = await fetchRetailOwners(supabase);

  const [leadsResult, quotesResult, salesResult, targetsResult] = await Promise.all([
    supabase
      .from("retail_leads")
      .select(
        "id, created_at, updated_at, customer_name, company_name, contact_name, contact_email, contact_phone, request_summary, request_details, source, pipeline_stage, lead_status, assigned_user_id, estimated_value, quote_value, quote_reference, quote_status, quote_valid_until, quoted_at, won_at, lost_at, sale_amount, notes",
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("retail_quotes")
      .select(
        "id, lead_id, created_at, quote_reference, status, total_value, valid_until, assigned_user_id",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("retail_sales")
      .select("id, lead_id, assigned_user_id, amount, closed_at")
      .order("closed_at", { ascending: false }),
    supabase
      .from("retail_targets")
      .select("month_key, target_amount")
      .order("month_key", { ascending: false }),
  ]);

  if (
    isMissingRetailTableError(leadsResult.error) ||
    isMissingRetailTableError(quotesResult.error) ||
    isMissingRetailTableError(salesResult.error) ||
    isMissingRetailTableError(targetsResult.error)
  ) {
    return {
      leads: [],
      quotes: [],
      sales: [],
      owners,
      targets: [],
      setupRequired: true,
    };
  }

  if (leadsResult.error) {
    throw leadsResult.error;
  }

  if (quotesResult.error) {
    throw quotesResult.error;
  }

  if (salesResult.error) {
    throw salesResult.error;
  }

  if (targetsResult.error) {
    throw targetsResult.error;
  }

  return {
    leads: (leadsResult.data ?? []) as RetailLead[],
    quotes: (quotesResult.data ?? []) as RetailQuote[],
    sales: (salesResult.data ?? []) as RetailSale[],
    owners,
    targets: (targetsResult.data ?? []) as RetailTarget[],
    setupRequired: false,
  };
}

export async function createRetailLead(
  supabase: SupabaseClient,
  payload: {
    customer_name: string;
    company_name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    request_summary: string;
    request_details: string | null;
    source: string | null;
    pipeline_stage: string;
    lead_status: string;
    assigned_user_id: string | null;
    estimated_value: number | null;
    quote_value: number | null;
    quote_reference: string | null;
    quote_status: string | null;
    quote_valid_until: string | null;
    notes: string | null;
  },
) {
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("retail_leads")
    .insert({
      ...payload,
      created_at: timestamp,
      updated_at: timestamp,
      quoted_at: payload.quote_reference ? timestamp : null,
    })
    .select(
      "id, created_at, updated_at, customer_name, company_name, contact_name, contact_email, contact_phone, request_summary, request_details, source, pipeline_stage, lead_status, assigned_user_id, estimated_value, quote_value, quote_reference, quote_status, quote_valid_until, quoted_at, won_at, lost_at, sale_amount, notes",
    )
    .single();

  if (error) {
    throw error;
  }

  if (payload.quote_reference || payload.quote_value) {
    const { error: quoteError } = await supabase.from("retail_quotes").insert({
      lead_id: data.id,
      quote_reference: payload.quote_reference,
      status: payload.quote_status ?? "draft",
      total_value: payload.quote_value,
      valid_until: payload.quote_valid_until,
      assigned_user_id: payload.assigned_user_id,
    });

    if (quoteError && !isMissingRetailTableError(quoteError)) {
      throw quoteError;
    }
  }

  return data as RetailLead;
}

export async function fetchRetailLeadById(supabase: SupabaseClient, leadId: string) {
  const [leadResult, activityResult, salesResult, owners] = await Promise.all([
    supabase
      .from("retail_leads")
      .select(
        "id, created_at, updated_at, customer_name, company_name, contact_name, contact_email, contact_phone, request_summary, request_details, source, pipeline_stage, lead_status, assigned_user_id, estimated_value, quote_value, quote_reference, quote_status, quote_valid_until, quoted_at, won_at, lost_at, sale_amount, notes",
      )
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("retail_activities")
      .select("id, lead_id, activity_type, activity_text, created_by, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("retail_sales")
      .select("id, lead_id, assigned_user_id, amount, closed_at")
      .eq("lead_id", leadId)
      .order("closed_at", { ascending: false }),
    fetchRetailOwners(supabase),
  ]);

  if (
    isMissingRetailTableError(leadResult.error) ||
    isMissingRetailTableError(activityResult.error) ||
    isMissingRetailTableError(salesResult.error)
  ) {
    return {
      lead: null,
      activities: [] as RetailActivity[],
      sales: [] as RetailSale[],
      owners,
      setupRequired: true,
    };
  }

  if (leadResult.error) {
    throw leadResult.error;
  }

  if (activityResult.error) {
    throw activityResult.error;
  }

  if (salesResult.error) {
    throw salesResult.error;
  }

  return {
    lead: (leadResult.data ?? null) as RetailLead | null,
    activities: (activityResult.data ?? []) as RetailActivity[],
    sales: (salesResult.data ?? []) as RetailSale[],
    owners,
    setupRequired: false,
  };
}

export async function updateRetailLead(
  supabase: SupabaseClient,
  leadId: string,
  payload: Partial<{
    customer_name: string | null;
    company_name: string | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    request_summary: string | null;
    request_details: string | null;
    source: string | null;
    pipeline_stage: string | null;
    lead_status: string | null;
    assigned_user_id: string | null;
    estimated_value: number | null;
    quote_value: number | null;
    quote_reference: string | null;
    quote_status: string | null;
    quote_valid_until: string | null;
    quoted_at: string | null;
    won_at: string | null;
    lost_at: string | null;
    sale_amount: number | null;
    notes: string | null;
  }>,
) {
  const { data, error } = await supabase
    .from("retail_leads")
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select(
      "id, created_at, updated_at, customer_name, company_name, contact_name, contact_email, contact_phone, request_summary, request_details, source, pipeline_stage, lead_status, assigned_user_id, estimated_value, quote_value, quote_reference, quote_status, quote_valid_until, quoted_at, won_at, lost_at, sale_amount, notes",
    )
    .single();

  if (error) {
    throw error;
  }

  return data as RetailLead;
}

export async function createRetailActivity(
  supabase: SupabaseClient,
  payload: {
    lead_id: string;
    activity_type: string;
    activity_text: string;
    created_by: string | null;
  },
) {
  const { data, error } = await supabase
    .from("retail_activities")
    .insert(payload)
    .select("id, lead_id, activity_type, activity_text, created_by, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data as RetailActivity;
}

export async function createRetailSale(
  supabase: SupabaseClient,
  payload: {
    lead_id: string;
    assigned_user_id: string | null;
    amount: number;
    notes?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("retail_sales")
    .insert({
      ...payload,
      closed_at: new Date().toISOString(),
    })
    .select("id, lead_id, assigned_user_id, amount, closed_at")
    .single();

  if (error) {
    throw error;
  }

  return data as RetailSale;
}

export async function syncRetailQuote(
  supabase: SupabaseClient,
  payload: {
    lead_id: string;
    quote_reference: string | null;
    status: string | null;
    total_value: number | null;
    valid_until: string | null;
    assigned_user_id: string | null;
  },
) {
  const { data: existing, error: existingError } = await supabase
    .from("retail_quotes")
    .select("id")
    .eq("lead_id", payload.lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError && !isMissingRetailTableError(existingError)) {
    throw existingError;
  }

  const quotePayload = {
    lead_id: payload.lead_id,
    quote_reference: payload.quote_reference,
    status: payload.status ?? "draft",
    total_value: payload.total_value,
    valid_until: payload.valid_until,
    assigned_user_id: payload.assigned_user_id,
  };

  if (existing?.id) {
    const { error } = await supabase.from("retail_quotes").update(quotePayload).eq("id", existing.id);
    if (error) {
      throw error;
    }
    return;
  }

  if (!payload.quote_reference && !payload.total_value) {
    return;
  }

  const { error } = await supabase.from("retail_quotes").insert(quotePayload);
  if (error && !isMissingRetailTableError(error)) {
    throw error;
  }
}

export function exportRetailLeadsCsv(leads: RetailLead[]) {
  const csvRows = [
    [
      "updated_at",
      "customer_name",
      "company_name",
      "contact_name",
      "request_summary",
      "pipeline_stage",
      "lead_status",
      "quote_reference",
      "quote_value",
      "assigned_user_id",
    ],
    ...leads.map((lead) => [
      lead.updated_at ?? lead.created_at ?? "",
      lead.customer_name ?? "",
      lead.company_name ?? "",
      lead.contact_name ?? "",
      lead.request_summary ?? "",
      lead.pipeline_stage ?? "",
      lead.lead_status ?? "",
      lead.quote_reference ?? "",
      lead.quote_value ?? "",
      lead.assigned_user_id ?? "",
    ]),
  ];

  const csvContent = csvRows
    .map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = `relay-retail-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

export function formatCurrency(value: number | null | undefined) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function getRetailDashboardMetrics(snapshot: RetailSnapshot): RetailDashboardMetrics {
  const monthKey = getMonthKey(new Date());
  const monthTarget =
    snapshot.targets.find((target) => target.month_key === monthKey)?.target_amount ??
    DEFAULT_MONTHLY_RETAIL_TARGET;
  const now = new Date();
  const activeLeads = snapshot.leads.filter(
    (lead) => !["won", "lost", "closed"].includes(normalizeRetailValue(lead.lead_status)),
  );
  const wonThisMonth = snapshot.sales
    .filter((sale) => isSameMonth(sale.closed_at, now))
    .reduce((sum, sale) => sum + (sale.amount ?? 0), 0);
  const weeklySales = snapshot.sales
    .filter((sale) => isWithinDays(sale.closed_at, now, 7))
    .reduce((sum, sale) => sum + (sale.amount ?? 0), 0);
  const monthlySales = snapshot.sales
    .filter((sale) => isSameMonth(sale.closed_at, now))
    .reduce((sum, sale) => sum + (sale.amount ?? 0), 0);
  const yearlySales = snapshot.sales
    .filter((sale) => isSameYear(sale.closed_at, now))
    .reduce((sum, sale) => sum + (sale.amount ?? 0), 0);
  const quotedValue = activeLeads.reduce((sum, lead) => sum + (lead.quote_value ?? 0), 0);
  const activePipelineValue = activeLeads.reduce(
    (sum, lead) => sum + (lead.estimated_value ?? lead.quote_value ?? lead.sale_amount ?? 0),
    0,
  );
  const overdueQuotes = snapshot.quotes.filter((quote) => {
    if (!quote.valid_until) {
      return false;
    }

    const normalizedStatus = normalizeRetailValue(quote.status);
    return (
      normalizedStatus !== "accepted" &&
      normalizedStatus !== "won" &&
      new Date(quote.valid_until) < now
    );
  }).length;
  const stageMap = new Map<string, { count: number; value: number }>();

  for (const lead of activeLeads) {
    const stage = labelRetailValue(lead.pipeline_stage || "new");
    const current = stageMap.get(stage) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += lead.estimated_value ?? lead.quote_value ?? 0;
    stageMap.set(stage, current);
  }

  const ownersById = new Map(snapshot.owners.map((owner) => [owner.id, owner]));
  const ownerBreakdownMap = new Map<
    string,
    { ownerId: string | null; ownerName: string; openLeads: number; quoteValue: number; wonValue: number }
  >();

  for (const lead of snapshot.leads) {
    const ownerId = lead.assigned_user_id;
    const ownerName = getRetailOwnerName(ownerId, ownersById);
    const key = ownerId ?? "unassigned";
    const current = ownerBreakdownMap.get(key) ?? {
      ownerId,
      ownerName,
      openLeads: 0,
      quoteValue: 0,
      wonValue: 0,
    };

    if (!["won", "lost", "closed"].includes(normalizeRetailValue(lead.lead_status))) {
      current.openLeads += 1;
    }

    current.quoteValue += lead.quote_value ?? 0;

    if (normalizeRetailValue(lead.lead_status) === "won") {
      current.wonValue += lead.sale_amount ?? lead.quote_value ?? lead.estimated_value ?? 0;
    }

    ownerBreakdownMap.set(key, current);
  }

  return {
    activePipelineValue,
    quotedValue,
    wonThisMonth,
    monthTarget,
    monthProgress: monthTarget > 0 ? Math.min(100, (monthlySales / monthTarget) * 100) : 0,
    openLeads: activeLeads.length,
    overdueQuotes,
    weeklySales,
    monthlySales,
    yearlySales,
    stageBreakdown: Array.from(stageMap.entries())
      .map(([stage, metrics]) => ({ stage, count: metrics.count, value: metrics.value }))
      .sort((left, right) => right.value - left.value),
    ownerBreakdown: Array.from(ownerBreakdownMap.values()).sort(
      (left, right) => right.wonValue - left.wonValue || right.quoteValue - left.quoteValue,
    ),
  };
}

export function labelRetailValue(value: string | null | undefined) {
  const normalized = normalizeRetailValue(value);

  if (!normalized) {
    return "Unspecified";
  }

  return normalized
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function normalizeRetailValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getRetailOwnerName(ownerId: string | null, ownersById: Map<string, RetailOwner>) {
  if (!ownerId) {
    return "Unassigned";
  }

  const owner = ownersById.get(ownerId);

  if (!owner) {
    return "Unknown owner";
  }

  return owner.full_name || owner.username || owner.id;
}

function getMonthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isWithinDays(value: string | null | undefined, now: Date, days: number) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function isSameMonth(value: string | null | undefined, now: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth()
  );
}

function isSameYear(value: string | null | undefined, now: Date) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === now.getUTCFullYear();
}
