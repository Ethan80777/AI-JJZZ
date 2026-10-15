import { it, expect } from 'vitest';
import { checkToolBinding, getTools, validateCustomTool } from '../../src/domain/tools/catalog';
it('allows manual tool additions updates and archival without credentials', () => {
  const rows = [
    {
      id: 'my-tool',
      name: '我的製作工具',
      category: '圖像',
      steps: '06,07',
      url: 'https://example.com',
    },
  ];
  expect(getTools(rows).find((t) => t.id === 'my-tool')?.steps).toEqual(['06', '07']);
  expect(getTools([{ id: 'kling', archived: 'true' }]).some((t) => t.id === 'kling')).toBe(false);
  expect(
    validateCustomTool({ ...rows[0], url: 'https://user:secret@example.com' }).length,
  ).toBeGreaterThan(0);
  expect(validateCustomTool(rows[0])).toEqual([]);
});

const reserved = {
  id: 'future-text',
  name: '文字模型預留',
  category: '文字',
  steps: '03,04',
  url: '',
  mode: 'api-reserved',
  apiProtocol: 'openai-compatible',
  apiBaseUrl: 'https://example.com/v1',
  apiModel: 'chosen-later',
};
it('retains a selectable API reservation without claiming an active connection', () => {
  expect(validateCustomTool(reserved)).toEqual([]);
  const tool = getTools([reserved]).find((t) => t.id === reserved.id)!;
  expect(tool.mode).toBe('api-reserved');
  expect(tool.api).toEqual({
    protocol: 'openai-compatible',
    baseUrl: reserved.apiBaseUrl,
    model: 'chosen-later',
  });
  expect(tool.verification).toBe('unverified');
  expect(checkToolBinding('03', tool, {})).toEqual([]);
  expect(checkToolBinding('08', tool, {})).not.toEqual([]);
  expect(checkToolBinding('03', tool, { apiKey: 'not-a-real-key' })).not.toEqual([]);
});
it('allows empty future endpoints but rejects unsafe or credential-bearing configuration', () => {
  expect(validateCustomTool({ ...reserved, apiBaseUrl: '', apiModel: '' })).toEqual([]);
  for (const apiBaseUrl of [
    'http://example.com',
    'https://user:pass@example.com',
    'https://example.com?key=secret',
    'https://example.com#secret',
  ])
    expect(validateCustomTool({ ...reserved, apiBaseUrl })).not.toEqual([]);
  expect(validateCustomTool({ ...reserved, apiProtocol: 'unknown' })).not.toEqual([]);
  expect(validateCustomTool({ ...reserved, apiKey: 'not-a-real-key' })).not.toEqual([]);
});
