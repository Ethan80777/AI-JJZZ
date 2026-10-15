import { it, expect } from 'vitest';
import { calculateEconomics } from '../../src/domain/finance/costs';
import {
  serializeSubtitles,
  validateSubtitles,
  createLocaleVariant,
} from '../../src/domain/localization/subtitles';
import { exportStoryboard } from '../../src/domain/storyboard/export';
import { checkToolBinding, TOOLS } from '../../src/domain/tools/catalog';
import { uid } from '../../src/shared/model';
it('distinguishes ROI and recovery and never divides by zero', () => {
  expect(
    calculateEconomics([{ amount: '100', currency: 'USD', status: 'actual' }], '150', 'USD'),
  ).toMatchObject({ totalCost: '100', roi: '0.5', recoveryMultiple: '1.5' });
  expect(calculateEconomics([], '150', 'USD').roi).toBeNull();
  expect(
    calculateEconomics([{ amount: '2', currency: 'EUR' }], '150', 'USD').missingInputs.length,
  ).toBe(1);
});
it('exports exact SRT and VTT times with Arabic intact', () => {
  const cues = [{ id: uid(), startMs: 90001, endMs: 93000, text: 'مرحباً 2026!' }];
  expect(serializeSubtitles(cues, 'srt')).toContain('00:01:30,001');
  expect(serializeSubtitles(cues, 'vtt')).toContain('00:01:30.001');
  expect(serializeSubtitles(cues, 'srt')).toContain('مرحباً 2026!');
  expect(
    validateSubtitles([{ ...cues[0], endMs: 0 }], { maxCharsPerSecond: 20, maxLines: 2 }).length,
  ).toBeGreaterThan(0);
});
it('branches any language without modifying source', () => {
  const source = {
    id: uid(),
    tag: 'fr',
    sourceId: null,
    episodeId: 'E01',
    terms: [],
    cues: [],
    notes: '',
  };
  const r = createLocaleVariant(source, 'ar');
  expect(r.tag).toBe('ar');
  expect(r.sourceId).toBe(source.id);
  expect(source.tag).toBe('fr');
});
it('escapes CSV quotes newlines and spreadsheet formulas', () => {
  const csv = exportStoryboard(
    [{ id: '1', dialogue: 'hello, "world"\nagain', prompt: '=1+1' }],
    'csv',
  );
  expect(csv).toContain('"hello, ""world""\nagain"');
  expect(csv).toContain("'=1+1");
});
it('unverified tools cannot run automatically or reuse model parameters', () => {
  const tool = TOOLS.find((t) => t.id === 'kling')!;
  expect(tool.verification).toBe('unverified');
  expect(checkToolBinding('08', tool, { model: 'unverified-model' }).length).toBeGreaterThan(0);
});
it('separates estimated and actual costs', async () => {
  const { calculateCostScenarios } = await import('../../src/domain/finance/costs');
  const r = calculateCostScenarios(
    [
      { amount: '100', status: '估算' },
      { amount: '80', status: '實際' },
    ],
    '150',
    'USD',
  );
  expect(r.estimated.totalCost).toBe('100');
  expect(r.actual.totalCost).toBe('80');
});
