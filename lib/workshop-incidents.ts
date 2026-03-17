"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RELAY_MEDIA_BUCKET,
  validateAttachmentFile,
} from "@/lib/relay-ticketing";

export const workshopIncidentTypes = ["DAMAGE", "TYRE_BREAKDOWN"] as const;
export const workshopIncidentStatuses = [
  "REPORTED",
  "ASSESSED",
  "AWAITING_PARTS",
  "PARTS_ASSIGNED",
  "IN_REPAIR",
  "READY",
  "CLOSED",
] as const;
export const workshopIncidentSeverities = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
] as const;

export type WorkshopIncidentType = (typeof workshopIncidentTypes)[number];
export type WorkshopIncidentStatus = (typeof workshopIncidentStatuses)[number];
export type WorkshopIncidentSeverity = (typeof workshopIncidentSeverities)[number];

export type WorkshopIncidentRecord = {
  id: string;
  user_id: string;
  reported_by: string;
  incident_type: WorkshopIncidentType;
  machine_reference: string;
  job_number: string;
  location_type: "Onsite" | "Yard";
  location_summary: string;
  description: string;
  severity: WorkshopIncidentSeverity;
  status: WorkshopIncidentStatus;
  assigned_to: string;
  notes: string;
  linked_parts_ticket_id?: string;
  po_number?: string;
  damage_area?: string;
  tyre_position?: string;
  vehicle_immobilised?: boolean;
  replacement_required?: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkshopIncidentAttachmentRecord = {
  id: string;
  incident_id: string;
  uploaded_by: string | null;
  file_name: string | null;
  file_path: string | null;
  file_url: string | null;
  signed_url?: string | null;
  mime_type: string | null;
  created_at: string | null;
};

type IncidentRow = {
  id: string;
  user_id: string;
  reported_by: string | null;
  incident_type: string;
  machine_reference: string;
  job_number: string | null;
  location_type: string;
  location_summary: string | null;
  description: string;
  severity: string;
  status: string;
  assigned_to: string | null;
  notes: string | null;
  linked_parts_ticket_id: string | null;
  po_number: string | null;
  damage_area: string | null;
  tyre_position: string | null;
  vehicle_immobilised: boolean | null;
  replacement_required: boolean | null;
  created_at: string;
  updated_at: string;
};

type IncidentDraft = Omit<
  WorkshopIncidentRecord,
  "id" | "created_at" | "updated_at" | "status" | "linked_parts_ticket_id"
>;

type IncidentPatch = Partial<
  Omit<WorkshopIncidentRecord, "id" | "created_at" | "user_id">
>;

export type LinkedPartsTicket = {
  id: string;
  job_number: string | null;
  status: string | null;
};

export async function listWorkshopIncidents(
  supabase: SupabaseClient,
  options?: {
    userId?: string | null;
    isAdmin?: boolean;
    scope?: "active" | "closed" | "all";
  },
) {
  let query = supabase
    .from("workshop_incidents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (options?.scope === "active") {
    query = query.neq("status", "CLOSED");
  }

  if (options?.scope === "closed") {
    query = query.eq("status", "CLOSED");
  }

  if (!options?.isAdmin && options?.userId) {
    query = query.eq("user_id", options.userId);
  }

  if (!options?.isAdmin && !options?.userId) {
    return [];
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(normalizeWorkshopIncidentRow);
}

export async function getWorkshopIncidentById(
  supabase: SupabaseClient,
  incidentId: string,
  options?: { userId?: string | null; isAdmin?: boolean },
) {
  let query = supabase
    .from("workshop_incidents")
    .select("*")
    .eq("id", incidentId);

  if (!options?.isAdmin && options?.userId) {
    query = query.eq("user_id", options.userId);
  }

  if (!options?.isAdmin && !options?.userId) {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? normalizeWorkshopIncidentRow(data) : null;
}

export async function createWorkshopIncident(
  supabase: SupabaseClient,
  draft: IncidentDraft,
) {
  const { data, error } = await supabase
    .from("workshop_incidents")
    .insert({
      user_id: draft.user_id,
      reported_by: draft.reported_by,
      incident_type: draft.incident_type,
      machine_reference: draft.machine_reference,
      job_number: draft.job_number || null,
      location_type: draft.location_type,
      location_summary: draft.location_summary || null,
      description: draft.description,
      severity: draft.severity,
      assigned_to: draft.assigned_to || null,
      notes: draft.notes || null,
      po_number: draft.po_number || null,
      damage_area: draft.damage_area || null,
      tyre_position: draft.tyre_position || null,
      vehicle_immobilised: draft.vehicle_immobilised ?? false,
      replacement_required: draft.replacement_required ?? false,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeWorkshopIncidentRow(data);
}

export async function updateWorkshopIncident(
  supabase: SupabaseClient,
  incidentId: string,
  patch: IncidentPatch,
) {
  const { data, error } = await supabase
    .from("workshop_incidents")
    .update({
      reported_by: patch.reported_by,
      incident_type: patch.incident_type,
      machine_reference: patch.machine_reference,
      job_number: patch.job_number,
      location_type: patch.location_type,
      location_summary: patch.location_summary,
      description: patch.description,
      severity: patch.severity,
      status: patch.status,
      assigned_to: patch.assigned_to,
      notes: patch.notes,
      linked_parts_ticket_id: patch.linked_parts_ticket_id,
      po_number: patch.po_number,
      damage_area: patch.damage_area,
      tyre_position: patch.tyre_position,
      vehicle_immobilised: patch.vehicle_immobilised,
      replacement_required: patch.replacement_required,
      updated_at: new Date().toISOString(),
    })
    .eq("id", incidentId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return normalizeWorkshopIncidentRow(data);
}

export function reconcileWorkshopIncidentsWithPartsTickets(
  incidents: WorkshopIncidentRecord[],
  tickets: LinkedPartsTicket[],
) {
  const ticketsByJobNumber = new Map(
    tickets
      .filter((ticket) => ticket.job_number)
      .map((ticket) => [ticket.job_number?.trim().toLowerCase(), ticket] as const),
  );

  return incidents.map((incident) => {
    const normalizedJobNumber = incident.job_number.trim().toLowerCase();
    const linkedTicket = normalizedJobNumber
      ? ticketsByJobNumber.get(normalizedJobNumber)
      : undefined;

    if (!linkedTicket) {
      return incident;
    }

    const shouldPromoteToPartsAssigned =
      incident.incident_type === "DAMAGE" &&
      incident.status === "AWAITING_PARTS" &&
      linkedTicket.status === "READY";

    return {
      ...incident,
      linked_parts_ticket_id: linkedTicket.id,
      status: shouldPromoteToPartsAssigned ? "PARTS_ASSIGNED" : incident.status,
    };
  });
}

export async function uploadWorkshopIncidentAttachments({
  supabase,
  incidentId,
  userId,
  files,
}: {
  supabase: SupabaseClient;
  incidentId: string;
  userId: string | null;
  files: File[];
}) {
  if (!userId) {
    throw new Error("You must be signed in to upload incident images.");
  }

  if (files.length > 5) {
    throw new Error("You can upload up to 5 incident photos at once.");
  }

  const uploaded: WorkshopIncidentAttachmentRecord[] = [];

  for (const file of files) {
    validateAttachmentFile(file);

    const storagePath = buildWorkshopAttachmentPath({
      userId,
      incidentId,
      fileName: file.name,
    });
    const { error: uploadError } = await supabase.storage
      .from(RELAY_MEDIA_BUCKET)
      .upload(storagePath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(RELAY_MEDIA_BUCKET).getPublicUrl(storagePath);

    const { data, error } = await supabase
      .from("workshop_incident_attachments")
      .insert({
        incident_id: incidentId,
        uploaded_by: userId,
        file_name: file.name,
        file_path: storagePath,
        file_url: publicUrl,
        mime_type: file.type || null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    uploaded.push(data as WorkshopIncidentAttachmentRecord);
  }

  return hydrateWorkshopIncidentAttachmentsWithSignedUrls(supabase, uploaded);
}

export async function fetchWorkshopIncidentAttachments(
  supabase: SupabaseClient,
  incidentId: string,
) {
  const { data, error } = await supabase
    .from("workshop_incident_attachments")
    .select("*")
    .eq("incident_id", incidentId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return hydrateWorkshopIncidentAttachmentsWithSignedUrls(
    supabase,
    (data ?? []) as WorkshopIncidentAttachmentRecord[],
  );
}

function normalizeWorkshopIncidentRow(row: IncidentRow): WorkshopIncidentRecord {
  return {
    id: row.id,
    user_id: row.user_id,
    reported_by: row.reported_by || "",
    incident_type: asIncidentType(row.incident_type),
    machine_reference: row.machine_reference,
    job_number: row.job_number || "",
    location_type: row.location_type === "Yard" ? "Yard" : "Onsite",
    location_summary: row.location_summary || "",
    description: row.description,
    severity: asIncidentSeverity(row.severity),
    status: asIncidentStatus(row.status),
    assigned_to: row.assigned_to || "",
    notes: row.notes || "",
    linked_parts_ticket_id: row.linked_parts_ticket_id || undefined,
    po_number: row.po_number || "",
    damage_area: row.damage_area || "",
    tyre_position: row.tyre_position || "",
    vehicle_immobilised: Boolean(row.vehicle_immobilised),
    replacement_required: Boolean(row.replacement_required),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildWorkshopAttachmentPath({
  userId,
  incidentId,
  fileName,
}: {
  userId: string;
  incidentId: string;
  fileName: string;
}) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${userId}/incidents/${incidentId}/${Date.now()}-${safeName}`;
}

async function hydrateWorkshopIncidentAttachmentsWithSignedUrls(
  supabase: SupabaseClient,
  attachments: WorkshopIncidentAttachmentRecord[],
) {
  return Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      signed_url: await createSignedAttachmentUrl(supabase, attachment.file_path),
    })),
  );
}

async function createSignedAttachmentUrl(
  supabase: SupabaseClient,
  filePath: string | null,
) {
  if (!filePath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(RELAY_MEDIA_BUCKET)
    .createSignedUrl(filePath, 60 * 60);

  if (error) {
    console.error("Failed to create workshop incident attachment URL", {
      filePath,
      message: error.message,
    });
    return null;
  }

  return data.signedUrl;
}

function asIncidentType(value: string): WorkshopIncidentType {
  return value === "TYRE_BREAKDOWN" ? "TYRE_BREAKDOWN" : "DAMAGE";
}

function asIncidentSeverity(value: string): WorkshopIncidentSeverity {
  if (
    value === "LOW" ||
    value === "MEDIUM" ||
    value === "HIGH" ||
    value === "CRITICAL"
  ) {
    return value;
  }

  return "MEDIUM";
}

function asIncidentStatus(value: string): WorkshopIncidentStatus {
  if (
    value === "REPORTED" ||
    value === "ASSESSED" ||
    value === "AWAITING_PARTS" ||
    value === "PARTS_ASSIGNED" ||
    value === "IN_REPAIR" ||
    value === "READY" ||
    value === "CLOSED"
  ) {
    return value;
  }

  return "REPORTED";
}
