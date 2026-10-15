import { it, expect } from 'vitest';
import { HandlePermissions } from '../../src/main/ipc/permissions';
it('foreign windows cannot use a project handle', () => {
  const p = new HandlePermissions();
  p.grant(1, 'a');
  expect(p.check(1, 'a')).toBe(true);
  expect(p.check(2, 'a')).toBe(false);
  p.revoke(1);
  expect(p.check(1, 'a')).toBe(false);
});
