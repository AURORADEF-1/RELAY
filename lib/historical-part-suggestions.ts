import { normalizeMachineNumber } from "@/lib/machine-registry";
import type { PartsLookupRecord } from "@/lib/parts-lookup";
import {
  normalizeSearchText,
  scoreTakeuchiPartSuggestion,
} from "@/lib/takeuchi-parts-catalog";

export type HistoricalPartEvidence =
  | "Exact machine history"
  | "Same model and serial family"
  | "Same model history";

export type HistoricalPartSuggestion = {
  id: string;
  partNumber: string;
  description: string;
  supplierName: string | null;
  evidenceSource: HistoricalPartEvidence;
  evidenceDetail: string;
  confidence: "High" | "Medium" | "Possible";
  matchScore: number;
  previousUses: number;
  ticketId: string;
  jobNumber: string | null;
  machineReference: string | null;
  machineMake: string | null;
  machineModel: string | null;
  machineSerialNumber: string | null;
  updatedAt: string;
};

type MachineContext = {
  machineNumber?: string | null;
  machineNumberNormalized?: string | null;
  machineReference?: string | null;
  machineMake?: string | null;
  machineModel?: string | null;
  machineSerialNumber?: string | null;
};

type RankedRecord = {
  record: PartsLookupRecord;
  evidenceSource: HistoricalPartEvidence;
  score: number;
  descriptionScore: number;
};

const GENERIC_REQUEST_TERMS = new Set([
  "add",
  "and",
  "for",
  "from",
  "job",
  "machine",
  "need",
  "needs",
  "new",
  "part",
  "please",
  "request",
  "required",
  "requires",
  "the",
  "this",
  "with",
]);

export function buildHistoricalPartSuggestions(
  records: PartsLookupRecord[],
  machine: MachineContext,
  requestText: string,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 8;
  const normalizedMake = normalizeIdentity(machine.machineMake);
  const normalizedModel = normalizeIdentity(machine.machineModel);
  const currentMachineKeys = buildMachineKeys(machine);
  const descriptionQuery = buildDescriptionQuery(requestText, machine);
  const ranked: RankedRecord[] = [];

  for (const record of records) {
    if (!record.part_number || !record.part_description) {
      continue;
    }

    const recordMachineKeys = buildMachineKeys({
      machineNumber: record.machine_number,
      machineNumberNormalized: record.machine_number_normalized,
      machineReference: record.machine_reference,
    });
    const exactMachine = Array.from(recordMachineKeys).some((key) => currentMachineKeys.has(key));
    const sameMakeModel =
      Boolean(normalizedMake && normalizedModel) &&
      normalizeIdentity(record.machine_make) === normalizedMake &&
      normalizeIdentity(record.machine_model) === normalizedModel;

    if (!exactMachine && !sameMakeModel) {
      continue;
    }

    const sameSerialFamily =
      sameMakeModel &&
      serialsShareFamily(machine.machineSerialNumber, record.machine_serial_number);
    const descriptionScore = scoreHistoricalDescription(record, descriptionQuery);

    if (descriptionQuery && !exactMachine && sameSerialFamily && descriptionScore < 8) {
      continue;
    }

    if (descriptionQuery && !exactMachine && !sameSerialFamily && descriptionScore < 14) {
      continue;
    }

    if (descriptionQuery && exactMachine && descriptionScore === 0) {
      continue;
    }

    const evidenceSource: HistoricalPartEvidence = exactMachine
      ? "Exact machine history"
      : sameSerialFamily
        ? "Same model and serial family"
        : "Same model history";
    const baseScore = exactMachine ? 110 : sameSerialFamily ? 72 : 45;

    ranked.push({
      record,
      evidenceSource,
      descriptionScore,
      score: baseScore + Math.min(descriptionScore, 90),
    });
  }

  const grouped = new Map<string, RankedRecord[]>();

  for (const entry of ranked) {
    const key = `${normalizeIdentity(entry.record.part_number)}|${normalizeSearchText(entry.record.part_description)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return Array.from(grouped.values())
    .map((matches) => buildSuggestion(matches))
    .sort((left, right) =>
      right.matchScore - left.matchScore ||
      right.previousUses - left.previousUses ||
      right.updatedAt.localeCompare(left.updatedAt),
    )
    .slice(0, limit);
}

function buildSuggestion(matches: RankedRecord[]): HistoricalPartSuggestion {
  const sortedMatches = matches.toSorted((left, right) =>
    right.score - left.score || right.record.updated_at.localeCompare(left.record.updated_at),
  );
  const best = sortedMatches[0];
  const previousUses = new Set(matches.map((match) => match.record.source_ticket_part_id)).size;
  const repeatBoost = Math.min(15, Math.max(0, previousUses - 1) * 3);
  const matchScore = best.score + repeatBoost;
  const confidence =
    best.evidenceSource === "Exact machine history" && best.descriptionScore >= 20
      ? "High"
      : best.evidenceSource === "Same model and serial family" && best.descriptionScore >= 14
        ? "Medium"
        : "Possible";

  return {
    id: best.record.id,
    partNumber: best.record.part_number,
    description: best.record.part_description,
    supplierName: best.record.supplier_name,
    evidenceSource: best.evidenceSource,
    evidenceDetail: buildEvidenceDetail(best.record, best.evidenceSource, previousUses),
    confidence,
    matchScore,
    previousUses,
    ticketId: best.record.ticket_id,
    jobNumber: best.record.job_number,
    machineReference: best.record.machine_reference || best.record.machine_number,
    machineMake: best.record.machine_make,
    machineModel: best.record.machine_model,
    machineSerialNumber: best.record.machine_serial_number,
    updatedAt: best.record.updated_at,
  };
}

function scoreHistoricalDescription(record: PartsLookupRecord, query: string) {
  if (!query) {
    return 1;
  }

  return scoreTakeuchiPartSuggestion(
    {
      bom_main_group: "",
      bom_sub_group: "",
      bom_item: record.notes,
      part_number: record.part_number,
      part_description: record.part_description,
      suggested_part_number: null,
    },
    query,
  );
}

function buildDescriptionQuery(requestText: string, machine: MachineContext) {
  const ignoredTerms = new Set(
    [
      ...GENERIC_REQUEST_TERMS,
      normalizeSearchText(machine.machineNumber),
      normalizeSearchText(machine.machineNumberNormalized),
      normalizeSearchText(machine.machineReference),
      normalizeSearchText(machine.machineMake),
      normalizeSearchText(machine.machineModel),
      normalizeSearchText(machine.machineSerialNumber),
    ].filter(Boolean),
  );

  return normalizeSearchText(requestText)
    .split(" ")
    .filter((term) => term.length > 2 && !ignoredTerms.has(term))
    .join(" ");
}

function buildMachineKeys(machine: Pick<MachineContext, "machineNumber" | "machineNumberNormalized" | "machineReference">) {
  return new Set(
    [machine.machineNumber, machine.machineNumberNormalized, machine.machineReference]
      .map((value) => normalizeMachineNumber(value ?? ""))
      .filter(Boolean),
  );
}

function normalizeIdentity(value: string | null | undefined) {
  return value?.trim().replace(/[\s_-]+/g, "").toUpperCase() || "";
}

function serialsShareFamily(left: string | null | undefined, right: string | null | undefined) {
  const leftSerial = parseSerial(left);
  const rightSerial = parseSerial(right);

  if (!leftSerial || !rightSerial || leftSerial.prefix !== rightSerial.prefix) {
    return false;
  }

  if (leftSerial.normalized === rightSerial.normalized) {
    return true;
  }

  if (leftSerial.digits.length !== rightSerial.digits.length) {
    return false;
  }

  const sharedPrefixLength = Math.max(3, leftSerial.digits.length - 3);
  if (leftSerial.digits.slice(0, sharedPrefixLength) === rightSerial.digits.slice(0, sharedPrefixLength)) {
    return true;
  }

  const leftNumber = Number.parseInt(leftSerial.digits, 10);
  const rightNumber = Number.parseInt(rightSerial.digits, 10);
  const maximumDistance = Math.max(250, Math.round(leftNumber * 0.02));
  return Math.abs(leftNumber - rightNumber) <= maximumDistance;
}

function parseSerial(value: string | null | undefined) {
  const normalized = value?.trim().replace(/[^a-z0-9]/gi, "").toUpperCase() || "";
  const match = normalized.match(/^([A-Z]*)(\d{4,})$/);

  if (!match) {
    return null;
  }

  return {
    normalized,
    prefix: match[1],
    digits: match[2],
  };
}

function buildEvidenceDetail(
  record: PartsLookupRecord,
  evidenceSource: HistoricalPartEvidence,
  previousUses: number,
) {
  return [
    evidenceSource,
    record.machine_reference || record.machine_number,
    [record.machine_make, record.machine_model].filter(Boolean).join(" ") || null,
    record.machine_serial_number ? `Serial ${record.machine_serial_number}` : null,
    record.job_number ? `Job ${record.job_number}` : null,
    `${previousUses} recorded use${previousUses === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
