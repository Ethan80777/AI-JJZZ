import { uid } from '../../src/shared/model';
import { closeAll } from '../../src/main/projects/project-service';
import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProject,
  openProject,
  readProject,
  commitChanges,
  closeProject,
} from '../../src/main/projects/project-service';
const roots: string[] = [];
const handles: string[] = [];
const dir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-'));
  roots.push(d);
  return d;
};
afterEach(async () => {
  for (const h of handles.splice(0)) await closeProject(h);
  for (const d of roots.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
async function create() {
  const p = path.join(dir(), '我的 劇集.aidrama');
  const r = await createProject(p, '我的 劇集');
  if (!r.ok) throw Error(r.error.message);
  handles.push(r.value);
  return { p, h: r.value };
}
it('create reopen preserves unicode and transactions', async () => {
  const { p, h } = await create();
  const a = await readProject(h);
  expect(a.ok).toBe(true);
  await closeProject(h);
  const b = await openProject(p);
  expect(b.ok).toBe(true);
  if (!b.ok) return;
  handles.push(b.value);
  expect(await readProject(b.value)).toEqual(a);
});
it('second writer is blocked and another same-name project is independent', async () => {
  const { p } = await create();
  expect(await openProject(p)).toMatchObject({ ok: false, error: { code: 'PROJECT_BUSY' } });
  expect((await create()).h).toBeTruthy();
});
it('missing assets does not create an empty database', async () => {
  const { p, h } = await create();
  await closeProject(h);
  fs.renameSync(p.replace('.aidrama', '.assets'), p + '.lost');
  const before = fs.readFileSync(p, 'utf8');
  expect((await openProject(p)).ok).toBe(false);
  expect(fs.readFileSync(p, 'utf8')).toBe(before);
  expect(fs.existsSync(p.replace('.aidrama', '.assets'))).toBe(false);
});
it('rejects future schemas and traversal without modifying originals', async () => {
  const { p, h } = await create();
  await closeProject(h);
  for (const edit of [{ version: 2 }, { assets: '../outside' }]) {
    const m = { ...JSON.parse(fs.readFileSync(p, 'utf8')), ...edit };
    fs.writeFileSync(p, JSON.stringify(m));
    const before = fs.readFileSync(p, 'utf8');
    expect((await openProject(p)).ok).toBe(false);
    expect(fs.readFileSync(p, 'utf8')).toBe(before);
  }
});
it('stale edits are rejected and a bad batch rolls back', async () => {
  const { h } = await create();
  const r = await readProject(h);
  if (!r.ok) throw Error();
  const stepId = r.value.template.steps[0].id;
  const change = {
    type: 'revision' as const,
    stepId,
    scope: { kind: 'project' as const },
    content: { kind: '01' as const, fields: { title: 'A' }, rows: [] },
    inputs: [],
    expectedRevisionId: null,
  };
  expect((await commitChanges(h, [change])).ok).toBe(true);
  expect(await commitChanges(h, [change])).toMatchObject({
    ok: false,
    error: { code: 'CONFLICT' },
  });
  const before = await readProject(h);
  expect((await commitChanges(h, [{ type: 'retention', count: 3 }, change])).ok).toBe(false);
  expect(await readProject(h)).toEqual(before);
});
it('refuses symlink project data', async () => {
  const { p, h } = await create();
  await closeProject(h);
  const assets = p.replace('.aidrama', '.assets');
  const renamed = assets + '-moved';
  fs.renameSync(assets, renamed);
  fs.symlinkSync(renamed, assets);
  expect((await openProject(p)).ok).toBe(false);
});
it('refuses overwriting existing project', async () => {
  const { p } = await create();
  expect((await createProject(p, 'overwrite')).ok).toBe(false);
});
it('locale changes preserve history and invalidate approved localization revisions', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'locale-history-'));
  try {
    const p = await createProject(path.join(d, 'p.aidrama'), 'P');
    if (!p.ok) throw Error();
    const result = await readProject(p.value);
    if (!result.ok) throw Error();
    const step = result.value.template.steps.find((s) => s.key === '11')!;
    await commitChanges(p.value, [
      {
        type: 'revision',
        stepId: step.id,
        scope: { kind: 'project' },
        expectedRevisionId: null,
        inputs: [],
        content: { kind: '11', fields: { source: 'en' }, rows: [] },
      },
    ]);
    const v = {
      id: uid(),
      tag: 'ar',
      episodeId: result.value.project.id,
      sourceId: null,
      terms: [],
      cues: [],
      notes: 'original',
    };
    await commitChanges(p.value, [{ type: 'locale', locale: v }]);
    const r = await commitChanges(p.value, [
      { type: 'locale', locale: { ...v, notes: 'changed' } },
    ]);
    expect(r.ok && r.value.revisions.at(-1)?.stale).toBe(true);
    expect(r.ok && (r.value as any).localeHistory?.some((x: any) => x.notes === 'original')).toBe(
      true,
    );
  } finally {
    await closeAll();
    fs.rmSync(d, { recursive: true, force: true });
  }
});
