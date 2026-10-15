import path from 'node:path';
import os from 'node:os';
import { it, expect } from 'vitest';
import { queueOpenRequest, drainOpenRequests } from '../../src/main/desktop/open-requests';
it('queues startup paths and deduplicates repeat double clicks', async () => {
  const first = path.join(os.tmpdir(), '中文 故事.aidrama');
  const second = path.join(os.tmpdir(), 'other.aidrama');
  queueOpenRequest(first);
  queueOpenRequest(first);
  queueOpenRequest(second);
  queueOpenRequest('--flag');
  const calls: string[] = [];
  await drainOpenRequests(async (p) => {
    calls.push(p);
  });
  expect(calls).toEqual([first, second]);
});
