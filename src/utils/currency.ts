/**
 * Format a price amount in Guinean Francs (GNF)
 * @param amount - The numeric amount to format
 * @returns Formatted string like "1,234 GNF"
 */
export function formatPrice(amount: number): string {
  const formatted = amount.toLocaleString('fr-GN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
 * @returns Formatted string like "1,234 GNF"
 */
export const formatCurrency = formatPrice;
