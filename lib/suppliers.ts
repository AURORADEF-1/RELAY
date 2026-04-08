export function normalizeSupplierName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function formatSupplierDisplayName(value: string) {
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
