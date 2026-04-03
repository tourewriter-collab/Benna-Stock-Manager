/**
 * Format a price amount in Guinean Francs (GNF).
 * Uses a hand-rolled formatter with a standard ASCII space as the thousands separator
 * to avoid Unicode non-breaking spaces (U+00A0, U+202F) produced by fr-GN locale,
 * which are not supported by all PDF fonts and render as dashes or slashes.
 * @param amount - The numeric amount to format
 * @returns Formatted string like "1 234 567 GNF"
 */
export function formatPrice(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount as number)) return '0 GNF';
  const rounded = Math.round(amount as number);
  // Split into groups of 3 digits separated by a standard ASCII space
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} GNF`;
}

/**
 * Parse a price string or number to a numeric value
 * @param value - The value to parse
 * @returns Numeric value
 */
export function parsePrice(value: string | number): number {
  if (typeof value === 'number') return value;
  const cleaned = value.replace(/[^\d]/g, '');
  return cleaned === '' ? 0 : Number(cleaned);
}

/**
 * Format currency (alias for formatPrice)
 * @param amount - The numeric amount to format
 * @returns Formatted string like "1 234 567 GNF"
 */
export const formatCurrency = formatPrice;
