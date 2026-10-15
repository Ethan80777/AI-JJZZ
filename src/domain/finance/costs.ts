import Decimal from 'decimal.js';
import type { Row } from '../../shared/model';
export function calculateEconomics(
  costs: Row[],
  revenue: string,
  baseCurrency: string,
  rates: Row[] = [],
) {
  let total = new Decimal(0);
  const missingInputs: string[] = [];
  for (const row of costs) {
    if (!row.amount) continue;
    try {
      let amount = new Decimal(row.amount);
      if (!amount.isFinite() || amount.isNegative()) throw Error();
      if (row.currency && row.currency !== baseCurrency) {
        const rate = rates.find(
          (r) => r.from === row.currency && r.to === baseCurrency && r.date && r.source,
        );
        if (!rate) {
          missingInputs.push('缺少 ' + row.currency + ' → ' + baseCurrency + ' 匯率');
          continue;
        }
        const value = new Decimal(rate.rate);
        if (!value.isFinite() || value.lte(0)) throw Error();
        amount = amount.mul(value);
      }
      total = total.add(amount);
    } catch {
      missingInputs.push('無效金額或匯率：' + row.amount);
    }
  }
  let roi: string | null = null,
    recoveryMultiple: string | null = null;
  try {
    const income = new Decimal(revenue);
    if (total.gt(0) && income.isFinite() && !income.isNegative() && !missingInputs.length) {
      roi = income.minus(total).div(total).toString();
      recoveryMultiple = income.div(total).toString();
    }
  } catch {
    missingInputs.push('收入尚未確認');
  }
  return { totalCost: total.toString(), roi, recoveryMultiple, missingInputs };
}
export function calculateCostScenarios(
  costs: Row[],
  revenue: string,
  currency: string,
  rates: Row[] = [],
) {
  const actual = (r: Row) => ['actual', '實際', '实际'].includes(r.status);
  return {
    estimated: calculateEconomics(
      costs.filter((r) => !actual(r)),
      revenue,
      currency,
      rates,
    ),
    actual: calculateEconomics(costs.filter(actual), revenue, currency, rates),
  };
}
