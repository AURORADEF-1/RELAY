"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export const partsQueryJobStatuses = ["OPEN", "CLOSED"] as const;
export const partsQueryCloseReasons = [
  "RETURNED_TO_STOCK",
  "RETURNED_TO_SUPPLIER",
  "FITTED_TO_JOB",
] as const;

export type PartsQueryJobStatus = (typeof partsQueryJobStatuses)[number];
export type PartsQueryCloseReason = (typeof partsQueryCloseReasons)[number];

export type PartsQueryRecord = {
  id: string;
  created_by: string | null;
  updated_by: string | null;
  part_description: string;
  job_number: string | null;
  part_price: number | null;
  ordered_for_job: boolean;
  fitter: string | null;
  workshop_response: string | null;
  job_status: PartsQueryJobStatus;
  close_reason: PartsQueryCloseReason | null;
  closed_job_number: string | null;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PartsQueryRow = {
  id: string;
  created_by: string | null;
  updated_by: string | null;
  part_description: string | null;
  job_number: string | null;
  part_price: number | string | null;
  ordered_for_job: boolean | null;
  fitter: string | null;
  workshop_response: string | null;
  job_status: string | null;
  close_reason: string | null;
  closed_job_number: string | null;
  closed_at: string | null;
  closed_by: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PartsQueryDraft = {
  part_description: string;
  job_number: string;
  part_price: string;
  ordered_for_job: boolean;
  fitter: string;
  workshop_response: string;
  job_status: PartsQueryJobStatus;
  notes: string;
};

export function buildEmptyPartsQueryDraft(): PartsQueryDraft {
  return {
    part_description: "",
    job_number: "",
    part_price: "",
    ordered_for_job: false,
    fitter: "",
    workshop_response: "",
    job_status: "OPEN",
    notes: "",
  };
}

export function buildPartsQueryDraft(record: PartsQueryRecord): PartsQueryDraft {
  return {
    part_description: record.part_description,
    job_number: record.job_number ?? "",
    part_price: typeof record.part_price === "number" ? record.part_price.toFixed(2) : "",
    ordered_for_job: record.ordered_for_job,
    fitter: record.fitter ?? "",
    workshop_response: record.workshop_response ?? "",
    job_status: record.job_status,
    notes: record.notes ?? "",
  };
}

export function formatPartsQueryCloseReason(reason: PartsQueryCloseReason | null | undefined) {
  switch (reason) {
    case "RETURNED_TO_STOCK":
      return "Returned to stock";
    case "RETURNED_TO_SUPPLIER":
      return "Returned to supplier";
    case "FITTED_TO_JOB":
      return "Fitted to job";
    default:
      return "-";
  }
}

export async function fetchPartsQueries(
  supabase: SupabaseClient,
  options?: { jobStatus?: PartsQueryJobStatus | "ALL" },
) {
  let query = supabase
    .from("parts_queries")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (options?.jobStatus === "OPEN") {
    query = query.eq("job_status", "OPEN");
  }

  if (options?.jobStatus === "CLOSED") {
    query = query.eq("job_status", "CLOSED");
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PartsQueryRow[]).map(normalizePartsQueryRow);
}

export async function createPartsQuery(
  supabase: SupabaseClient,
  payload: {
    createdBy: string | null;
    updatedBy: string | null;
    partDescription: string;
    jobNumber?: string | null;
    partPrice?: number | null;
    orderedForJob?: boolean;
    fitter?: string | null;
    workshopResponse?: string | null;
    jobStatus?: PartsQueryJobStatus;
    notes?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("parts_queries")
    .insert({
      created_by: payload.createdBy,
      updated_by: payload.updatedBy,
      part_description: payload.partDescription.trim(),
      job_number: payload.jobNumber?.trim() || null,
      part_price: typeof payload.partPrice === "number" ? payload.partPrice : null,
      ordered_for_job: payload.orderedForJob ?? false,
      fitter: payload.fitter?.trim() || null,
      workshop_response: payload.workshopResponse?.trim() || null,
      job_status: payload.jobStatus ?? "OPEN",
      notes: payload.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePartsQueryRow(data as PartsQueryRow);
}

export async function updatePartsQuery(
  supabase: SupabaseClient,
  queryId: string,
  payload: {
    updatedBy: string | null;
    partDescription?: string;
    jobNumber?: string | null;
    partPrice?: number | null;
    orderedForJob?: boolean;
    fitter?: string | null;
    workshopResponse?: string | null;
    jobStatus?: PartsQueryJobStatus;
    notes?: string | null;
  },
) {
  const updatePayload: Record<string, string | number | boolean | null> = {
    updated_at: new Date().toISOString(),
    updated_by: payload.updatedBy,
  };

  if (typeof payload.partDescription === "string") {
    updatePayload.part_description = payload.partDescription.trim();
  }

  if (payload.jobNumber !== undefined) {
    updatePayload.job_number = payload.jobNumber?.trim() || null;
  }

  if (payload.partPrice !== undefined) {
    updatePayload.part_price = typeof payload.partPrice === "number" ? payload.partPrice : null;
  }

  if (typeof payload.orderedForJob === "boolean") {
    updatePayload.ordered_for_job = payload.orderedForJob;
  }

  if (payload.fitter !== undefined) {
    updatePayload.fitter = payload.fitter?.trim() || null;
  }

  if (payload.workshopResponse !== undefined) {
    updatePayload.workshop_response = payload.workshopResponse?.trim() || null;
  }

  if (payload.jobStatus) {
    updatePayload.job_status = payload.jobStatus;
  }

  if (payload.notes !== undefined) {
    updatePayload.notes = payload.notes?.trim() || null;
  }

  const { data, error } = await supabase
    .from("parts_queries")
    .update(updatePayload)
    .eq("id", queryId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePartsQueryRow(data as PartsQueryRow);
}

export async function closePartsQuery(
  supabase: SupabaseClient,
  queryId: string,
  payload: {
    updatedBy: string | null;
    closeReason: PartsQueryCloseReason;
    jobNumber?: string | null;
  },
) {
  const nextJobNumber = payload.jobNumber?.trim() || null;

  if (payload.closeReason === "FITTED_TO_JOB" && !nextJobNumber) {
    throw new Error("A job number is required when marking the query as fitted to a job.");
  }

  const updatePayload: Record<string, string | number | boolean | null> = {
    updated_at: new Date().toISOString(),
    updated_by: payload.updatedBy,
    job_status: "CLOSED",
    close_reason: payload.closeReason,
    closed_job_number: payload.closeReason === "FITTED_TO_JOB" ? nextJobNumber : null,
    closed_at: new Date().toISOString(),
    closed_by: payload.updatedBy,
  };

  if (payload.closeReason === "FITTED_TO_JOB") {
    updatePayload.job_number = nextJobNumber;
  }

  const { data, error } = await supabase
    .from("parts_queries")
    .update(updatePayload)
    .eq("id", queryId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePartsQueryRow(data as PartsQueryRow);
}

export async function reopenPartsQuery(
  supabase: SupabaseClient,
  queryId: string,
  payload: { updatedBy: string | null },
) {
  const { data, error } = await supabase
    .from("parts_queries")
    .update({
      updated_at: new Date().toISOString(),
      updated_by: payload.updatedBy,
      job_status: "OPEN",
      close_reason: null,
      closed_job_number: null,
      closed_at: null,
      closed_by: null,
    })
    .eq("id", queryId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizePartsQueryRow(data as PartsQueryRow);
}

export function buildPartsQueriesCsvContent(queries: PartsQueryRecord[]) {
  const rows = [
    [
      "created_at",
      "updated_at",
      "job_status",
      "close_reason",
      "closed_job_number",
      "closed_at",
      "part_description",
      "job_number",
      "part_price",
      "ordered_for_job",
      "fitter",
      "workshop_response",
      "notes",
      "created_by",
      "updated_by",
    ],
    ...queries.map((query) => [
      query.created_at,
      query.updated_at,
      query.job_status,
      query.close_reason ?? "",
      query.closed_job_number ?? "",
      query.closed_at ?? "",
      query.part_description,
      query.job_number ?? "",
      typeof query.part_price === "number" ? String(query.part_price) : "",
      query.ordered_for_job ? "true" : "false",
      query.fitter ?? "",
      query.workshop_response ?? "",
      query.notes ?? "",
      query.created_by ?? "",
      query.updated_by ?? "",
    ]),
  ];

  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
        .join(","),
    )
    .join("\n");
}

function normalizePartsQueryRow(row: PartsQueryRow): PartsQueryRecord {
  const normalizedPartPrice =
    typeof row.part_price === "number"
      ? row.part_price
      : typeof row.part_price === "string" && row.part_price.trim()
        ? Number(row.part_price)
        : null;

  return {
    id: row.id,
    created_by: row.created_by ?? null,
    updated_by: row.updated_by ?? null,
    part_description: row.part_description?.trim() || "",
    job_number: row.job_number?.trim() || null,
    part_price:
      typeof normalizedPartPrice === "number" && Number.isFinite(normalizedPartPrice)
        ? Number(normalizedPartPrice.toFixed(2))
        : null,
    ordered_for_job: row.ordered_for_job ?? false,
    fitter: row.fitter?.trim() || null,
    workshop_response: row.workshop_response?.trim() || null,
    job_status: row.job_status === "CLOSED" ? "CLOSED" : "OPEN",
    close_reason: normalizeCloseReason(row.close_reason),
    closed_job_number: row.closed_job_number?.trim() || null,
    closed_at: row.closed_at ?? null,
    closed_by: row.closed_by ?? null,
    notes: row.notes?.trim() || null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  };
}

function normalizeCloseReason(value: string | null): PartsQueryCloseReason | null {
  if (value === "RETURNED_TO_STOCK") {
    return value;
  }

  if (value === "RETURNED_TO_SUPPLIER") {
    return value;
  }

  if (value === "FITTED_TO_JOB") {
    return value;
  }

  return null;
}
