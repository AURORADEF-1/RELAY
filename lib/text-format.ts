/**
 * Applies the AssetCare+ title rule to user-entered text: trim surrounding
 * whitespace and capitalise every word without changing existing acronyms,
 * part numbers, or model codes.
 */
export function formatEnteredTitle(value: string) {
  const trimmed = value.trim();
  return trimmed.replace(/(^|[^\p{L}\p{N}])(\p{L})/gu, (_match, prefix: string, letter: string) =>
    `${prefix}${letter.toLocaleUpperCase("en-GB")}`,
  );
}
