/** Minimal RFC-4180-style CSV serialiser for the dashboard export. */
export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const escape = (value: string | number | null | undefined): string => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}
