import { it, expect } from 'vitest';
import { getTools, validateCustomTool } from '../../src/domain/tools/catalog';
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
