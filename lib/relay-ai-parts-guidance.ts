"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { lookupMachineRegistryRecord, type MachineRegistryRecord } from "@/lib/machine-registry";
import {
  buildTakeuchiModelCandidates,
  buildTakeuchiPartSuggestions,
  fetchTakeuchiPartsCatalog,
  normalizeWorkshopPartQuery,
  normalizeTakeuchiModel,
  parseTakeuchiSerialNumber,
  type TakeuchiPartSuggestion,
} from "@/lib/takeuchi-parts-catalog";

const RELAY_AI_CATALOGUE_ROW_LIMIT = 2_500;
const RELAY_AI_SUGGESTION_LIMIT = 5;

export type RelayAiPartsGuidance = {
  machine: MachineRegistryRecord | null;
  machineVerified: boolean;
  isTakeuchi: boolean;
  catalogueAvailable: boolean;
  suggestions: TakeuchiPartSuggestion[];
  text: string;
  facts: string[];
  sourceNote: string;
};

export type RelayAiTakeuchiPartQuestion = {
  model: string;
  description: string;
};

export type RelayAiMachinePartQuestion = {
  machineReference: string;
  description: string;
};

function isTakeuchiMachine(machine: MachineRegistryRecord | null) {
  if (!machine) return false;
  const make = machine.make?.trim().toLowerCase() ?? "";
  const model = normalizeTakeuchiModel(machine.model || machine.item_description);
  return make.includes("takeuchi") || model.startsWith("TB") || model.includes("TAKEUCHI");
}

function catalogueModel(machine: MachineRegistryRecord) {
  return machine.model?.trim() || machine.item_description?.trim() || "";
}

async function hasCompatibleTakeuchiCatalogue(
  supabase: SupabaseClient,
  machineModel: string,
  serialNumber: string | null,
) {
  const candidates = buildTakeuchiModelCandidates(machineModel);
  if (candidates.length === 0) return false;

  let query = supabase
    .from("takeuchi_parts_catalog")
    .select("id")
    .limit(1);

  if (candidates.length === 1) {
    query = query.eq("machine_model_normalized", candidates[0]);
  } else {
    query = query.or(
      candidates.map((candidate) => `machine_model_normalized.ilike.*${candidate}*`).join(","),
    );
  }

  const serial = parseTakeuchiSerialNumber(serialNumber);
  if (serial !== null) {
    query = query.lte("serial_start", serial).gte("serial_end", serial);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

function suggestionLines(suggestions: TakeuchiPartSuggestion[]) {
  return suggestions.map((suggestion, index) => {
    const partNumber = suggestion.suggested_part_number || suggestion.part_number;
    return `${index + 1}. ${partNumber} — ${suggestion.part_description || suggestion.bom_sub_group} (${suggestion.matchReason})`;
  }).join("\n");
}

function rankUniqueSuggestions(
  catalogue: Parameters<typeof buildTakeuchiPartSuggestions>[0],
  description: string,
) {
  const seen = new Set<string>();
  return buildTakeuchiPartSuggestions(catalogue, description, { limit: 30 })
    .filter((suggestion) => {
      const key = [
        suggestion.suggested_part_number || suggestion.part_number,
        suggestion.part_description,
      ].join("|").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RELAY_AI_SUGGESTION_LIMIT);
}

export async function buildRelayAiTicketPartsGuidance(
  supabase: SupabaseClient,
  input: {
    machineReference: string;
    requestDetails?: string;
    includeCatalogue?: boolean;
  },
): Promise<RelayAiPartsGuidance> {
  const machine = await lookupMachineRegistryRecord(supabase, input.machineReference);
  if (!machine) {
    return {
      machine: null,
      machineVerified: false,
      isTakeuchi: false,
      catalogueAvailable: false,
      suggestions: [],
      text: `Machine ${input.machineReference} was not found in the verified machine registry. Catalogue matching is unavailable, but RELAY can retain your best description for the parts team.`,
      facts: ["Machine not verified", "Catalogue unavailable"],
      sourceNote: "Exact machine-reference lookup. No manufacturer catalogue query was run.",
    };
  }

  const takeuchi = isTakeuchiMachine(machine);
  if (input.includeCatalogue === false) {
    const machineLabel = [machine.make, machine.model].filter(Boolean).join(" ")
      || machine.item_description;
    const requestDescription = input.requestDetails?.trim();
    return {
      machine,
      machineVerified: true,
      isTakeuchi: takeuchi,
      catalogueAvailable: false,
      suggestions: [],
      text: `Machine ${machine.machine_number} is verified as ${machineLabel}${machine.serial_number ? `, serial ${machine.serial_number}` : ""}.${requestDescription ? ` RELAY captured the request as “${requestDescription}”.` : ""}`,
      facts: [
        "Machine verified",
        machine.make || "Make not recorded",
        requestDescription ? "Request description captured" : "Request description required",
      ],
      sourceNote: "Authenticated requester lookup against the verified machine registry. Catalogue rows remain restricted to the parts team.",
    };
  }

  if (!takeuchi) {
    return {
      machine,
      machineVerified: true,
      isTakeuchi: false,
      catalogueAvailable: false,
      suggestions: [],
      text: `Machine ${machine.machine_number} is verified as ${[machine.make, machine.model].filter(Boolean).join(" ") || machine.item_description}. No compatible Takeuchi catalogue applies, so RELAY will retain your best description for the parts team.`,
      facts: ["Machine verified", machine.make || "Make not recorded", "Takeuchi catalogue not applicable"],
      sourceNote: "Verified machine registry record. Manufacturer catalogue matching was not applicable.",
    };
  }

  const model = catalogueModel(machine);
  const catalogueAvailable = await hasCompatibleTakeuchiCatalogue(
    supabase,
    model,
    machine.serial_number,
  );
  const machineLabel = [machine.make, machine.model].filter(Boolean).join(" ") || machine.item_description;

  if (!catalogueAvailable) {
    return {
      machine,
      machineVerified: true,
      isTakeuchi: true,
      catalogueAvailable: false,
      suggestions: [],
      text: `Machine ${machine.machine_number} is verified as ${machineLabel}${machine.serial_number ? `, serial ${machine.serial_number}` : ""}. No compatible Takeuchi catalogue range was found. Please use the best description available for the parts team.`,
      facts: ["Machine verified", "No compatible catalogue"],
      sourceNote: "Verified machine model and serial-range availability check against the Takeuchi catalogue.",
    };
  }

  const description = input.requestDetails?.trim() || "";
  if (!description) {
    return {
      machine,
      machineVerified: true,
      isTakeuchi: true,
      catalogueAvailable: true,
      suggestions: [],
      text: `Machine ${machine.machine_number} is verified as ${machineLabel}${machine.serial_number ? `, serial ${machine.serial_number}` : ""}. A compatible Takeuchi parts catalogue is available.`,
      facts: ["Machine verified", "Takeuchi catalogue available"],
      sourceNote: "Verified machine model and serial-range availability check against the Takeuchi catalogue.",
    };
  }

  const normalizedDescription = normalizeWorkshopPartQuery(description);
  const catalogue = await fetchTakeuchiPartsCatalog(supabase, {
    machineModel: model,
    serialNumber: machine.serial_number,
    maxRows: RELAY_AI_CATALOGUE_ROW_LIMIT,
    searchText: normalizedDescription,
  });
  const suggestions = rankUniqueSuggestions(catalogue, normalizedDescription);
  const interpretation = normalizedDescription !== description.toLowerCase()
    ? `\n\nInterpreted request: “${normalizedDescription}”.`
    : "";

  return {
    machine,
    machineVerified: true,
    isTakeuchi: true,
    catalogueAvailable: true,
    suggestions,
    text: suggestions.length > 0
      ? `Machine ${machine.machine_number} is verified and a compatible Takeuchi catalogue is available.${interpretation}\n\nClosest catalogue matches\n${suggestionLines(suggestions)}\n\nThese are catalogue candidates, not confirmed fitment. The parts team must verify the part number before ordering.`
      : `Machine ${machine.machine_number} is verified and a compatible Takeuchi catalogue is available.${interpretation}\n\nNo match found. Please use the best description available for the parts team.`,
    facts: [
      "Machine verified",
      "Takeuchi catalogue available",
      `${suggestions.length} catalogue ${suggestions.length === 1 ? "match" : "matches"}`,
    ],
    sourceNote: `Model and serial-compatible Takeuchi catalogue search, bounded to ${RELAY_AI_CATALOGUE_ROW_LIMIT.toLocaleString("en-GB")} rows. Suggestions are not automatically verified.`,
  };
}

export function parseRelayAiMachinePartQuestion(
  question: string,
): RelayAiMachinePartQuestion | null {
  const machineMatch = question.match(
    /\b(?:machine|fleet)(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*([a-z0-9][a-z0-9/_-]*)\b/i,
  );
  const machineReference = machineMatch?.[1]?.trim();
  if (!machineMatch || !machineReference || !/\d/.test(machineReference)) return null;

  const afterMachine = question.slice((machineMatch.index ?? 0) + machineMatch[0].length);
  const afterDescription = afterMachine.match(
    /\b(?:i\s+)?(?:need|needs|require|requires|want|wants|looking\s+for)\s+(?:(?:a|an|the)\s+)?(.+?)(?:[.?!]|$)/i,
  )?.[1];
  const beforeDescription = question.match(
    /\b(?:i\s+)?(?:need|require|want|looking\s+for|find)\s+(?:(?:a|an|the)\s+)?(.+?)\s+for\s+(?:machine|fleet)(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*[a-z0-9][a-z0-9/_-]*\b/i,
  )?.[1];
  const description = (afterDescription || beforeDescription)
    ?.trim()
    .replace(/[,.!?;:]+$/, "");

  return description ? { machineReference, description } : null;
}

export function parseRelayAiTakeuchiPartQuestion(
  question: string,
): RelayAiTakeuchiPartQuestion | null {
  const model = question.match(/\b(TB\s*\d{2,4}(?:\s*-\s*\d+)?)\b/i)?.[1]
    ?.replace(/\s+/g, "")
    .toUpperCase();
  if (!model || !/\b(?:need|require|looking for|find|part number|what is)\b/i.test(question)) {
    return null;
  }

  const beforeModel = question.match(
    /\b(?:need|require|looking for|find)\s+(?:a|an|the)?\s*(.+?)\s+for\s+(?:a|an|the)?\s*TB\s*\d{2,4}(?:\s*-\s*\d+)?\b/i,
  )?.[1];
  const afterModel = question.match(
    /\bTB\s*\d{2,4}(?:\s*-\s*\d+)?\s+(.+?)(?:[.?!]|$)/i,
  )?.[1];
  const partNumberQuestion = question.match(
    /\bpart number\s+for\s+(?:a|an|the)?\s*TB\s*\d{2,4}(?:\s*-\s*\d+)?\s+(.+?)(?:[.?!]|$)/i,
  )?.[1];
  const description = (beforeModel || partNumberQuestion || afterModel || "")
    .trim()
    .replace(/[,.!?;:]+$/, "");

  return { model, description };
}

export async function answerRelayAiTakeuchiPartQuestion(
  supabase: SupabaseClient,
  question: RelayAiTakeuchiPartQuestion,
) {
  const availability = await fetchTakeuchiPartsCatalog(supabase, {
    machineModel: question.model,
    maxRows: 1,
  });
  if (availability.length === 0) {
    return {
      text: `No Takeuchi catalogue is available for ${question.model}. Use a verified fleet reference or provide the best description for the parts team.`,
      facts: [question.model, "Catalogue unavailable"],
      sourceNote: "Bounded model-only Takeuchi catalogue availability check.",
    };
  }
  if (!question.description || /^parts?$|^a parts?$/i.test(question.description)) {
    return {
      text: `A Takeuchi catalogue is available for ${question.model}. Please describe the part you require. Add a verified fleet reference for exact machine and serial-range matching.`,
      facts: [question.model, "Catalogue available", "Description required"],
      sourceNote: "Model-only catalogue lookup. The machine itself has not been verified.",
    };
  }

  const catalogue = await fetchTakeuchiPartsCatalog(supabase, {
    machineModel: question.model,
    maxRows: RELAY_AI_CATALOGUE_ROW_LIMIT,
    searchText: question.description,
  });
  const suggestions = rankUniqueSuggestions(catalogue, question.description);
  return {
    text: suggestions.length > 0
      ? `${question.model} catalogue matches for “${question.description}”\n\n${suggestionLines(suggestions)}\n\nThese are model-level candidates. Provide the fleet reference to verify the machine and serial range before ordering.`
      : `A Takeuchi catalogue is available for ${question.model}, but no match was found for “${question.description}”. Please use the best description available for the parts team.`,
    facts: [
      question.model,
      "Catalogue available",
      `${suggestions.length} ${suggestions.length === 1 ? "match" : "matches"}`,
    ],
    sourceNote: `Model-level catalogue search bounded to ${RELAY_AI_CATALOGUE_ROW_LIMIT.toLocaleString("en-GB")} rows. No machine or fitment was automatically verified.`,
  };
}
