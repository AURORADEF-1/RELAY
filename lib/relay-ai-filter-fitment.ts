import type {
  RicoFleetFilter,
  RicoFleetKitComponent,
  RicoFleetMachineDetail,
  RicoFleetMachineSummary,
} from "@/lib/integrations/rico/fleet-types";
import { normalizeMachineNumber } from "@/lib/machine-registry";

export const relayAiFilterKinds = [
  "all",
  "oil",
  "air",
  "fuel",
  "hydraulic",
  "cabin",
  "transmission",
  "water-separator",
  "coolant",
  "service-kit",
] as const;

export type RelayAiFilterKind = (typeof relayAiFilterKinds)[number];

export type RelayAiFilterQuestion = {
  machineReference: string;
  filterKind: RelayAiFilterKind;
};

export type RelayAiFilterAnswer = {
  text: string;
  facts: string[];
  sourceNote: string;
  copyText?: string;
};

const filterKindLabels: Record<RelayAiFilterKind, string> = {
  all: "filter",
  oil: "oil filter",
  air: "air filter",
  fuel: "fuel filter",
  hydraulic: "hydraulic filter",
  cabin: "cabin filter",
  transmission: "transmission filter",
  "water-separator": "water separator",
  coolant: "coolant filter",
  "service-kit": "service kit",
};

function cleanReference(value: string | undefined) {
  const reference = (value ?? "").trim().replace(/[,.!?;:]+$/, "");
  if (!/\d/.test(reference) || /^\d+\s*(?:h|hr|hrs|hours)$/i.test(reference)) return "";
  return reference;
}

function requestedFilterKind(question: string): RelayAiFilterKind {
  if (/\b(?:service|filter)\s*kit\b/i.test(question)) return "service-kit";
  if (/\b(?:water\s*separator|fuel\s*water)\b/i.test(question)) return "water-separator";
  if (/\b(?:hydraulic|hyd)\b/i.test(question)) return "hydraulic";
  if (/\b(?:transmission|gearbox)\b/i.test(question)) return "transmission";
  if (/\b(?:cabin|cab|pollen)\b/i.test(question)) return "cabin";
  if (/\b(?:engine\s+oil|oil)\s+filter\b/i.test(question)) return "oil";
  if (/\bfuel\b/i.test(question)) return "fuel";
  if (/\bair\b/i.test(question)) return "air";
  if (/\b(?:coolant|water)\s+filter\b/i.test(question)) return "coolant";
  return "all";
}

export function parseRelayAiFilterQuestion(question: string): RelayAiFilterQuestion | null {
  if (!/\b(?:filter|filters|filtration|service\s*kit)\b/i.test(question)) return null;
  if (!/\b(?:what|which|show|find|list|fit|fits|fitted|need|uses?|for)\b/i.test(question)) {
    return null;
  }

  const labelled = question.match(
    /\b(?:machine|fleet|plant)(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*([a-z0-9][a-z0-9/_-]*)\b/i,
  )?.[1];
  const afterFor = question.match(
    /\b(?:for|fits?|fitted\s+to|on)\s+(?:(?:the|a)\s+)?(?:(?:machine|fleet|plant)(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*)?(?:is|:|#|-)?\s*([a-z0-9][a-z0-9/_-]*)\b/i,
  )?.[1];
  const beforeMachine = question.match(
    /\b([a-z0-9][a-z0-9/_-]*\d[a-z0-9/_-]*)\s+(?:machine|fleet|plant)\b/i,
  )?.[1];
  const machineReference = cleanReference(labelled || afterFor || beforeMachine);

  return machineReference
    ? { machineReference, filterKind: requestedFilterKind(question) }
    : null;
}

function machineReferences(machine: RicoFleetMachineSummary) {
  return [
    machine.machineRef,
    machine.fleetNumber,
    machine.serialNumber,
    ...machine.units.flatMap((unit) => [unit.fleetNumber, unit.serialNumber]),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeMachineNumber);
}

export function chooseRelayAiFleetMachine(
  machines: RicoFleetMachineSummary[],
  machineReference: string,
  serialNumber?: string | null,
) {
  const reference = normalizeMachineNumber(machineReference);
  const serial = normalizeMachineNumber(serialNumber ?? "");
  return machines.find((machine) => {
    const references = machineReferences(machine);
    return references.includes(reference) || Boolean(serial && references.includes(serial));
  }) ?? null;
}

function filterSearchText(filter: RicoFleetFilter) {
  return [
    filter.filterType,
    filter.category,
    filter.description,
    filter.catalogueDescription,
  ].filter(Boolean).join(" ").toLowerCase();
}

function filterMatchesKind(filter: RicoFleetFilter, kind: RelayAiFilterKind) {
  if (kind === "all") return true;
  const text = filterSearchText(filter);
  switch (kind) {
    case "oil":
      return /\boil\b/.test(text) && !/\b(?:hydraulic|transmission|gearbox)\b/.test(text);
    case "air":
      return /\b(?:air|air cleaner)\b/.test(text);
    case "fuel":
      return /\bfuel\b/.test(text) && !/\bwater\s*separator\b/.test(text);
    case "hydraulic":
      return /\b(?:hydraulic|hyd)\b/.test(text);
    case "cabin":
      return /\b(?:cabin|cab|pollen)\b/.test(text);
    case "transmission":
      return /\b(?:transmission|gearbox)\b/.test(text);
    case "water-separator":
      return /\b(?:water\s*separator|fuel\s*water)\b/.test(text);
    case "coolant":
      return /\b(?:coolant|water\s*filter)\b/.test(text);
    case "service-kit":
      return false;
  }
}

function kitComponentMatchesKind(component: RicoFleetKitComponent, kind: RelayAiFilterKind) {
  if (kind === "all" || kind === "service-kit") return true;
  return filterMatchesKind({
    partNumber: component.partNumber,
    description: component.description,
    filterType: null,
    category: null,
    quantity: 1,
    bin: null,
    isOem: false,
    verified: false,
    price: null,
    priceSource: null,
    freeStock: null,
    manufacturerStock: null,
    inCatalogue: false,
    catalogueDescription: null,
    imageUrl: null,
  }, kind);
}

function formatMoney(value: number | null) {
  return value === null
    ? null
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

function filterLine(filter: RicoFleetFilter) {
  const details = [
    filter.quantity > 1 ? `quantity ${filter.quantity}` : null,
    formatMoney(filter.price),
    filter.freeStock === null
      ? null
      : filter.freeStock > 0
        ? `${filter.freeStock} available`
        : "out of stock",
    filter.verified ? "verified by RICO" : "fitment not marked verified",
  ].filter(Boolean);
  return `• ${filter.partNumber} — ${filter.description || filter.catalogueDescription || "Filter"}${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

export function buildRelayAiFilterAnswer(
  detail: RicoFleetMachineDetail,
  question: RelayAiFilterQuestion,
): RelayAiFilterAnswer {
  const machine = detail.machine;
  const machineLabel = [machine.manufacturer, machine.model].filter(Boolean).join(" ")
    || machine.label
    || question.machineReference;
  const requestedLabel = filterKindLabels[question.filterKind];
  const directMatches = detail.filters
    .filter((filter) => filterMatchesKind(filter, question.filterKind))
    .filter((filter, index, filters) =>
      filters.findIndex((candidate) =>
        candidate.partNumber.toUpperCase() === filter.partNumber.toUpperCase()
      ) === index
    );

  if (question.filterKind === "service-kit") {
    if (!detail.kits.length) {
      return {
        text: `RICO Fleet has no service kit configured for machine ${question.machineReference} (${machineLabel}). No compatible kit should be inferred from another machine.`,
        facts: ["RICO Fleet checked", "0 service kits", machineLabel],
        sourceNote: `Live read-only RICO Fleet fitment lookup checked ${detail.checkedAt}.`,
      };
    }
    const lines = detail.kits.slice(0, 8).map((kit) => {
      const details = [
        kit.serviceInterval,
        formatMoney(kit.price),
        kit.freeStock === null
          ? null
          : kit.freeStock > 0
            ? `${kit.freeStock} available`
            : "out of stock",
        `${kit.filters.length} component${kit.filters.length === 1 ? "" : "s"}`,
      ].filter(Boolean);
      return `• ${kit.kitPartNumber}${details.length ? ` · ${details.join(" · ")}` : ""}`;
    });
    return {
      text: `RICO Fleet lists ${detail.kits.length} service kit${detail.kits.length === 1 ? "" : "s"} for machine ${question.machineReference} (${machineLabel}).\n\n${lines.join("\n")}${detail.kits.length > lines.length ? `\n• Plus ${detail.kits.length - lines.length} more` : ""}`,
      facts: ["RICO Fleet fitment", `${detail.kits.length} service kits`, machineLabel],
      sourceNote: `Live read-only RICO Fleet fitment, price and stock lookup checked ${detail.checkedAt}.`,
      copyText: lines.join("\n"),
    };
  }

  if (directMatches.length) {
    const lines = directMatches.slice(0, 12).map(filterLine);
    const verifiedCount = directMatches.filter((filter) => filter.verified).length;
    return {
      text: `RICO Fleet lists ${directMatches.length} ${requestedLabel}${directMatches.length === 1 ? "" : "s"} for machine ${question.machineReference} (${machineLabel}).\n\n${lines.join("\n")}${directMatches.length > lines.length ? `\n• Plus ${directMatches.length - lines.length} more` : ""}\n\nCheck the serial number and any supersession before ordering.`,
      facts: [
        "RICO Fleet fitment",
        `${directMatches.length} match${directMatches.length === 1 ? "" : "es"}`,
        `${verifiedCount} RICO verified`,
      ],
      sourceNote: `Live read-only RICO Fleet fitted-filter, price and stock lookup checked ${detail.checkedAt}. Unverified records are labelled explicitly.`,
      copyText: lines.join("\n"),
    };
  }

  const kitComponents = detail.kits.flatMap((kit) =>
    kit.filters
      .filter((component) => kitComponentMatchesKind(component, question.filterKind))
      .map((component) => ({ ...component, kitPartNumber: kit.kitPartNumber }))
  ).filter((component, index, components) =>
    components.findIndex((candidate) =>
      candidate.partNumber.toUpperCase() === component.partNumber.toUpperCase()
    ) === index
  );

  if (kitComponents.length) {
    const lines = kitComponents.slice(0, 12).map(
      (component) =>
        `• ${component.partNumber} — ${component.description} · component of ${component.kitPartNumber}`,
    );
    return {
      text: `RICO Fleet has no standalone ${requestedLabel} record for machine ${question.machineReference} (${machineLabel}), but these matching kit components are recorded:\n\n${lines.join("\n")}\n\nThese are kit components, not independently verified standalone fitment. Check the machine serial before ordering.`,
      facts: ["RICO Fleet kit data", `${kitComponents.length} component matches`, "Standalone fitment unconfirmed"],
      sourceNote: `Live read-only RICO Fleet service-kit lookup checked ${detail.checkedAt}. No standalone fitted-filter match was returned.`,
      copyText: lines.join("\n"),
    };
  }

  return {
    text: `RICO Fleet returned no ${requestedLabel} for machine ${question.machineReference} (${machineLabel}). I have not substituted a filter from another machine. Check the machine reference or use Filter Lookup for a wider catalogue search.`,
    facts: ["RICO Fleet checked", "0 confirmed matches", machineLabel],
    sourceNote: `Live read-only RICO Fleet fitment lookup checked ${detail.checkedAt}.`,
  };
}
