export const cur = (n: number | null | undefined, currency = 'USD', digits = 2) =>
  n == null ? '-' : new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const num = (n: number | null | undefined, digits = 0) => (n == null ? '-' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n));
export const pct = (n: number | null | undefined, digits = 2) => (n == null ? '-' : `${n.toFixed(digits)}%`);
