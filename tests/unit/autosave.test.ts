import { it, expect } from 'vitest';
import { SaveQueue } from '../../src/renderer/features/editors/save-queue';
it('fast typing saves final value in order', async () => {
  const saved: string[] = [];
  const q = new SaveQueue<string>(
    async (v) => {
      await new Promise((r) => setTimeout(r, 5));
      saved.push(v);
    },
    () => {},
  );
  q.put('A');
  q.put('AB');
  q.put('ABC');
  expect(await q.flush()).toBe(true);
  expect(saved.at(-1)).toBe('ABC');
});
it('failed save keeps pending draft and retry flushes it', async () => {
  let fail = true;
  const saved: string[] = [];
  const q = new SaveQueue<string>(
    async (v) => {
      if (fail) throw Error('disk full');
      saved.push(v);
    },
    () => {},
  );
  q.put('draft');
  expect(await q.flush()).toBe(false);
  expect(q.pending).toBe('draft');
  fail = false;
  expect(await q.flush()).toBe(true);
  expect(saved).toEqual(['draft']);
});
