"use client";

export const workshopIncidentTypes = ["DAMAGE", "TYRE_BREAKDOWN"] as const;
export const workshopIncidentStatuses = [
  "REPORTED",
  "ASSESSED",
  "AWAITING_PARTS",
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
  damage_area?: string;
  tyre_position?: string;
  vehicle_immobilised?: boolean;
  replacement_required?: boolean;
  created_at: string;
  updated_at: string;
};

type IncidentDraft = Omit<
  WorkshopIncidentRecord,
  "id" | "created_at" | "updated_at" | "status"
>;

const WORKSHOP_INCIDENTS_STORAGE_KEY = "relay-workshop-incidents";

const seedIncidents: WorkshopIncidentRecord[] = [
  {
    id: "incident-seed-1",
    user_id: "seed-admin",
    reported_by: "Workshop Control",
    incident_type: "DAMAGE",
    machine_reference: "EX-221",
    job_number: "483321",
    location_type: "Onsite",
    location_summary: "Braintree Yard Entry",
    description: "Rear panel impact damage and broken light cluster.",
    severity: "HIGH",
    status: "ASSESSED",
    assigned_to: "Tom",
    notes: "Awaiting panel confirmation before parts order.",
    damage_area: "Rear body panel",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 14).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: "incident-seed-2",
    user_id: "seed-user",
    reported_by: "Van Workshop",
    incident_type: "TYRE_BREAKDOWN",
    machine_reference: "VAN-07",
    job_number: "482904",
    location_type: "Onsite",
    location_summary: "Service road loading bay",
    description: "Front near-side tyre blowout with vehicle immobilised.",
    severity: "CRITICAL",
    status: "IN_REPAIR",
    assigned_to: "Stores Tyre Team",
    notes: "Replacement tyre issued and fitter dispatched.",
    tyre_position: "Front near-side",
    vehicle_immobilised: true,
    replacement_required: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
];

export function getWorkshopIncidents(options?: {
  userId?: string | null;
  isAdmin?: boolean;
}) {
  const incidents = readWorkshopIncidents();

  if (options?.isAdmin) {
    return incidents;
  }

  if (!options?.userId) {
    return [];
  }

  return incidents.filter((incident) => incident.user_id === options.userId);
}

export function getWorkshopIncidentById(
  incidentId: string,
  options?: { userId?: string | null; isAdmin?: boolean },
) {
  return getWorkshopIncidents(options).find((incident) => incident.id === incidentId) ?? null;
}

export function createWorkshopIncident(draft: IncidentDraft) {
  const incidents = readWorkshopIncidents();
  const timestamp = new Date().toISOString();
  const nextIncident: WorkshopIncidentRecord = {
    ...draft,
    id: buildIncidentId(),
    status: "REPORTED",
    created_at: timestamp,
    updated_at: timestamp,
  };

  const nextIncidents = [nextIncident, ...incidents];
  writeWorkshopIncidents(nextIncidents);
  return nextIncident;
}

export function updateWorkshopIncident(
  incidentId: string,
  patch: Partial<Omit<WorkshopIncidentRecord, "id" | "created_at" | "user_id">>,
) {
  const incidents = readWorkshopIncidents();
  let updatedIncident: WorkshopIncidentRecord | null = null;

  const nextIncidents = incidents.map((incident) => {
    if (incident.id !== incidentId) {
      return incident;
    }

    updatedIncident = {
      ...incident,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    return updatedIncident;
  });

  writeWorkshopIncidents(nextIncidents);
  return updatedIncident;
}

function readWorkshopIncidents() {
  if (typeof window === "undefined") {
    return seedIncidents;
  }

  const stored = window.localStorage.getItem(WORKSHOP_INCIDENTS_STORAGE_KEY);

  if (!stored) {
    window.localStorage.setItem(
      WORKSHOP_INCIDENTS_STORAGE_KEY,
      JSON.stringify(seedIncidents),
    );
    return seedIncidents;
  }

  try {
    const parsed = JSON.parse(stored) as WorkshopIncidentRecord[];
    return Array.isArray(parsed) ? parsed : seedIncidents;
  } catch {
    window.localStorage.setItem(
      WORKSHOP_INCIDENTS_STORAGE_KEY,
      JSON.stringify(seedIncidents),
    );
    return seedIncidents;
  }
}

function writeWorkshopIncidents(incidents: WorkshopIncidentRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    WORKSHOP_INCIDENTS_STORAGE_KEY,
    JSON.stringify(incidents),
  );
}

function buildIncidentId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `incident-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
