/** Money is integer cents everywhere; these are the only places it becomes text. */

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const WHOLE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

export type MoneyOptions = {
  /** Prefix positive amounts with "+", as in a transaction list. */
  signed?: boolean;
  /** Drop the cents: "$1,235". */
  whole?: boolean;
};

/** "$1,234.50", "-$20.00", or "+$1,234.50" when signed. */
export function formatMoney(cents: number, options: MoneyOptions = {}): string {
  const format = options.whole ? WHOLE : CURRENCY;
  const text = format.format(Math.abs(cents) / 100);
  if (cents < 0) return `-${text}`;
  return options.signed && cents > 0 ? `+${text}` : text;
}

/** "$1.2M", "$48.3K", "$950" — for chart axes and tight spaces. */
export function formatCompactMoney(cents: number): string {
  const text = COMPACT.format(Math.abs(cents) / 100);
  return cents < 0 ? `-${text}` : text;
}

/**
 * Reads what a person types into an amount field ("1,250", "$1250.5", "12.34")
 * as cents. Returns null for anything that is not a plain positive amount with
 * at most two decimals, so "1.999" is rejected rather than silently rounded.
 */
export function parseMoneyInput(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents as a plain editable string: 125050 -> "1,250.50". */
export function toMoneyInput(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Percent change from `previous` to `current`, or null when there is no base. */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** "+12.4%" / "-3.0%" / "0.0%". */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

/** 460 basis points -> "4.60%". */
export function formatApy(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
