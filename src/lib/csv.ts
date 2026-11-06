/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Neutralizes text that a spreadsheet would execute as a formula (CSV
 * injection). Use for free text such as descriptions and notes, not for
 * numeric columns, where a leading minus sign is legitimate.
 */
export function safeText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function escapeCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with CRLF line endings. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  return [header, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n")
    .concat("\r\n");
}
