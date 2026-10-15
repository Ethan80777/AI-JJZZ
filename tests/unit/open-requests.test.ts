import { it, expect } from 'vitest';
import { queueOpenRequest, drainOpenRequests } from '../../src/main/desktop/open-requests';
it('queues startup paths and deduplicates repeat double clicks', async () => {
  queueOpenRequest('/tmp/中文 故事.aidrama');
  queueOpenRequest('/tmp/中文 故事.aidrama');
  queueOpenRequest('/tmp/other.aidrama');
  queueOpenRequest('--flag');
  const calls: string[] = [];
  await drainOpenRequests(async (p) => {
    calls.push(p);
  });
  expect(calls).toEqual(['/tmp/中文 故事.aidrama', '/tmp/other.aidrama']);
});
