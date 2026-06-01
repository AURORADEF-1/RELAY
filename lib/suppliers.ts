const CANONICAL_SUPPLIER_DISPLAY_NAMES: Record<string, string> = {
  "watling": "Watling JCB",
  "watling jcb": "Watling JCB",
  "watlings": "Watling JCB",
  "watlings jcb": "Watling JCB",
};

export function normalizeSupplierName(value: string) {
  return canonicalizeSupplierDisplayName(value).toLowerCase();
}

export function formatSupplierDisplayName(value: string) {
  return canonicalizeSupplierDisplayName(value);
}

export function canonicalizeSupplierDisplayName(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();

  if (CANONICAL_SUPPLIER_DISPLAY_NAMES[normalized]) {
    return CANONICAL_SUPPLIER_DISPLAY_NAMES[normalized];
  }

  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function normalizeSupplierEmail(value: string) {
  return value.trim().toLowerCase();
}
