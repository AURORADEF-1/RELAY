type MachineClassificationSource = {
  make?: string | null;
  model?: string | null;
  item_description?: string | null;
};

const uppercaseManufacturers = new Set(["JCB", "XCMG", "UTV", "ATV"]);

export function classifyMachineForNexus(machine: MachineClassificationSource) {
  const rawMake = clean(machine.make) || firstWord(machine.item_description);
  const manufacturer = formatManufacturer(rawMake);
  const source =
    clean(machine.model) ||
    removeLeadingMake(machine.item_description, rawMake);
  const withoutMake = removeLeadingMake(source, rawMake);
  const model = extractModelCode(withoutMake);
  return { manufacturer, model };
}

function extractModelCode(value: string) {
  const tokens = value
    .replace(/·/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Z0-9]+|[^A-Z0-9-]+$/gi, ""))
    .filter(Boolean);
  const likelyModel = tokens.find(
    (token) => /[A-Z]/i.test(token) && /\d/.test(token),
  );
  return (likelyModel ?? tokens[0] ?? "").toUpperCase();
}

function formatManufacturer(value: string) {
  const upper = value.toUpperCase();
  if (uppercaseManufacturers.has(upper)) return upper;
  return upper
    .toLowerCase()
    .replace(
      /(^|[\s-])([a-z])/g,
      (_, boundary: string, letter: string) =>
        `${boundary}${letter.toUpperCase()}`,
    );
}

function removeLeadingMake(value: string | null | undefined, make: string) {
  const cleaned = clean(value);
  if (!make) return cleaned;
  return cleaned.replace(new RegExp(`^${escapeRegExp(make)}\\s+`, "i"), "");
}

function firstWord(value: string | null | undefined) {
  return clean(value).split(/\s+/)[0] ?? "";
}

function clean(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
