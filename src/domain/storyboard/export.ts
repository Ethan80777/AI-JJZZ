import type { Row } from '../../shared/model';
export function exportStoryboard(rows: Row[], format: 'csv' | 'json'): string {
  if (format === 'json') return JSON.stringify(rows, null, 2);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const escape = (s: string) => {
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  return (
    '\ufeff' +
    [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ''))]
      .map((r) => r.map(escape).join(','))
      .join('\r\n')
  );
}
