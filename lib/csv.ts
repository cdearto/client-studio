// CSV for spreadsheets. Subscriber names come from the public signup form, so a
// cell must never be read as a formula ("=HYPERLINK(…)" and friends).

/** One cell: formula-looking values get a leading ', then quoted if needed. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');
