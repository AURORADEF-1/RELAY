import type { MachineRegistryRecord } from "@/lib/machine-registry";
import type { RelayConsoleAiAnswer } from "@/lib/relay-console-ai";

export function parseRelayAiMachineReference(question: string) {
  const match = question.match(
    /\bmachine(?:\s*(?:number|no\.?|ref(?:erence)?))?\s*(?:is|:|#|-)?\s*([a-z0-9][a-z0-9 /_-]*?)(?=\s+(?:make|model|serial|details|information)\b|[,.!?]|$)/i,
  );
  const reference = match?.[1]?.trim().replace(/\s+/g, " ") ?? "";
  return /\d/.test(reference) ? reference : null;
}

export function answerMachineRegistryLookup(
  reference: string,
  machine: MachineRegistryRecord | null,
): RelayConsoleAiAnswer {
  if (!machine) {
    return {
      text: `Machine reference ${reference} was not found in the live machine registry. Check the reference before using it on a ticket.`,
      facts: ["Not verified", reference, "No registry match"],
      sourceNote: "Exact normalized machine-reference lookup against the live machines table.",
    };
  }

  const copyText = [
    `Machine: ${machine.machine_number}`,
    `Make: ${machine.make || "Not recorded"}`,
    `Model: ${machine.model || "Not recorded"}`,
    `Serial number: ${machine.serial_number || "Not recorded"}`,
  ].join("\n");
  return {
    text: [
      `Machine ${machine.machine_number}`,
      `Make: ${machine.make || "not recorded"}`,
      `Model: ${machine.model || "not recorded"}`,
      `Serial number: ${machine.serial_number || "not recorded"}`,
      `Description: ${machine.item_description || "not recorded"}`,
      `Fleet type: ${machine.fleet_type || "not recorded"} · Status: ${machine.status || "not recorded"}`,
    ].join("\n"),
    facts: ["Registry verified", machine.make || "Make unknown", machine.model || "Model unknown"],
    sourceNote: `Live machines registry record${machine.source_sheet ? ` from ${machine.source_sheet}` : ""}.`,
    copyText,
  };
}
