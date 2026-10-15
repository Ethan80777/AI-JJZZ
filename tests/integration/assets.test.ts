import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createProject,
  closeAll,
  readProject,
  session,
} from '../../src/main/projects/project-service';
import { importAsset, resolveAsset } from '../../src/main/assets/asset-service';
const dirs: string[] = [];
afterEach(async () => {
  await closeAll();
  dirs.forEach((p) => fs.rmSync(p, { recursive: true, force: true }));
  dirs.length = 0;
});
it('imports copies and hashes while preserving same-name files', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'));
  dirs.push(d);
  const p = await createProject(path.join(d, 'p.aidrama'), 'P');
  if (!p.ok) throw Error();
  const f = path.join(d, 'license.txt');
  fs.writeFileSync(f, 'first authorization');
  const a = await importAsset(p.value, f);
  fs.writeFileSync(f, 'second authorization');
  const b = await importAsset(p.value, f);
  expect(a.ok && b.ok).toBe(true);
  if (!a.ok || !b.ok) return;
  expect(a.value.sha256).not.toBe(b.value.sha256);
  expect(fs.readFileSync(resolveAsset(p.value, a.value.id), 'utf8')).toBe('first authorization');
  expect(resolveAsset(p.value, a.value.id).startsWith(session(p.value).root)).toBe(true);
  expect(() => resolveAsset(p.value, '../../etc/passwd')).toThrow();
});
it('rejects invalid media without marking it usable', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-media-'));
  dirs.push(d);
  const h = await createProject(path.join(d, 'p.aidrama'), 'P');
  if (!h.ok) throw Error();
  const f = path.join(d, 'broken.mp4');
  fs.writeFileSync(f, 'not a video');
  expect((await importAsset(h.value, f)).ok).toBe(false);
  const s = await readProject(h.value);
  expect(s.ok && s.value.assets.length).toBe(0);
});
it('rejects an audio stream disguised as video by its extension', async () => {
  const { execFileSync } = await import('node:child_process');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'disguised-'));
  dirs.push(d);
  const p = await createProject(path.join(d, 'p.aidrama'), 'P');
  if (!p.ok) throw Error();
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    path.join(d, 'audio.wav'),
  ]);
  fs.copyFileSync(path.join(d, 'audio.wav'), path.join(d, 'fake.mp4'));
  expect((await importAsset(p.value, path.join(d, 'fake.mp4'))).ok).toBe(false);
});
