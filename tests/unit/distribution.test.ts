import { it, expect } from 'vitest';
import { parseMetrics, computeMetric } from '../../src/domain/distribution/metrics';
it('preserves CSV quoted fields and rejects invalid denominators', () => {
  const r = parseMetrics(
    'episode,metric,numerator,denominator,notes\nE01,hold,45,100,"good, hook"',
  );
  expect(r.ok && r.value[0].notes).toBe('good, hook');
  expect(parseMetrics('metric,numerator,denominator\nhold,1,-2').ok).toBe(false);
  expect(computeMetric(5, 0)).toBeNull();
  expect(computeMetric(45, 100)).toBe(0.45);
});
