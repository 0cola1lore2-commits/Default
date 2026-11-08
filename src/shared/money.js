// Toate sumele sunt numere întregi în "bani" (1 leu = 100 bani), ca să evităm erorile de virgulă mobilă.

const full = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * Formatează o sumă în bani ca text: "14,50 lei".
 * Cu `compact: true`, sumele rotunde apar fără zecimale: "165 lei".
 */
export function formatPrice(bani, { compact: isCompact = false } = {}) {
  if (isCompact && bani % 100 === 0) return `${compact.format(bani / 100)} lei`;
  return `${full.format(bani / 100)} lei`;
}

/** Convertește lei (ex. 14.5) în bani întregi (1450). */
export function leiToBani(lei) {
  return Math.round(Number(lei) * 100);
}
