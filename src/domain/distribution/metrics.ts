import Papa from 'papaparse';
import { ok, err, type Row } from '../../shared/model';
export function computeMetric(numerator: number, denominator: number) {
  return Number.isFinite(numerator) &&
    Number.isFinite(denominator) &&
    numerator >= 0 &&
    denominator > 0
    ? numerator / denominator
    : null;
}
export function parseMetrics(csv: string) {
  const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) return err('CSV', parsed.errors[0].message);
  if (!parsed.meta.fields?.includes('metric')) return err('CSV', '缺少 metric 欄位');
  for (const row of parsed.data) {
    if (
      !row.numerator ||
      !row.denominator ||
      !Number.isFinite(Number(row.numerator)) ||
      !Number.isFinite(Number(row.denominator)) ||
      Number(row.numerator) < 0 ||
      Number(row.denominator) < 0
    )
      return err('CSV', '分子／分母須為非負數');
  }
  return ok(parsed.data);
}
