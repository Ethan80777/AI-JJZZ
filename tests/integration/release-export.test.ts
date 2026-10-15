import { it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import yauzl from 'yauzl';
import {
  createProject,
  commitChanges,
  readProject,
  closeAll,
} from '../../src/main/projects/project-service';
import { importAsset } from '../../src/main/assets/asset-service';
import { exportRelease } from '../../src/main/projects/release-export';
import { FIELDS } from '../../src/domain/workflow/fields';
import { GATE_STEPS } from '../../src/domain/workflow/gates';
import {
  latestRevision,
  uid,
  type Result,
  type Gate,
  type ProjectSnapshot,
} from '../../src/shared/model';
const dirs: string[] = [];
const value = <T>(r: Result<T>): T => {
  if (!r.ok) throw Error(r.error.message);
  return r.value;
};
afterEach(async () => {
  await closeAll();
  dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
});
async function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
  dirs.push(d);
  const h = value(await createProject(path.join(d, '示例.aidrama'), '原創驗收示例'));
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=64x64:d=1',
    '-c:v',
    'libx264',
    path.join(d, 'video.mp4'),
  ]);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=64x64',
    '-frames:v',
    '1',
    path.join(d, 'cover.png'),
  ]);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    path.join(d, 'audio.wav'),
  ]);
  const video = value(await importAsset(h, path.join(d, 'video.mp4'))),
    cover = value(await importAsset(h, path.join(d, 'cover.png'))),
    audio = value(await importAsset(h, path.join(d, 'audio.wav')));
  for (const a of [video, cover, audio])
    value(
      await commitChanges(h, [
        {
          type: 'asset',
          assetId: a.id,
          status: 'accepted',
          reason: '原創測試',
          rights: 'licensed',
          licenseNote: '自行產生，驗收示例',
        },
      ]),
    );
  let s = value(await readProject(h));
  const episodeId = uid();
  const scope = { kind: 'episode' as const, episodeId };
  s = value(
    await commitChanges(h, [
      { type: 'records', collection: 'episodes', rows: [{ id: episodeId, name: 'E01' }] },
    ]),
  );
  for (const tag of ['zh-Hant', 'ar'])
    value(
      await commitChanges(h, [
        {
          type: 'locale',
          locale: {
            id: uid(),
            tag,
            episodeId,
            sourceId: null,
            terms: [],
            cues: [
              {
                id: uid(),
                startMs: 0,
                endMs: 1000,
                text: tag === 'ar' ? 'مرحباً 2026' : '原創驗收示例',
              },
            ],
            notes: '人工翻譯',
          },
        },
      ]),
    );
  s = value(await readProject(h));
  for (const step of s.template.steps) {
    const config = FIELDS[step.key];
    const fields = Object.fromEntries(config.fields.map((f) => [f.key, '示例']));
    Object.assign(fields, {
      duration: '1',
      tolerance: '0',
      masterAsset: video.id,
      coverAsset: cover.id,
      market: 'TW',
      platform: 'manual',
    });
    const row = Object.fromEntries(config.columns.map((f) => [f.key, '示例']));
    Object.assign(row, {
      id: uid(),
      duration: '1',
      time: '1',
      in: '0',
      out: '1',
      speed: '1',
      status: 'licensed',
      source: '原創',
      expires: '2099-01-01',
      assetId:
        step.key === '08' || step.key === '10' ? video.id : step.key === '09' ? audio.id : cover.id,
      startAsset: cover.id,
      endAsset: cover.id,
    });
    s = value(
      await commitChanges(h, [
        {
          type: 'revision',
          stepId: step.id,
          scope,
          content: { kind: step.key, fields, rows: [row] },
          inputs: s.template.edges
            .filter((e) => e.to === step.id)
            .map((e) => latestRevision(s, e.from, scope)!.id),
          expectedRevisionId: null,
        },
      ]),
    );
    for (const [gate, keys] of Object.entries(GATE_STEPS))
      if (keys.at(-1) === step.key)
        s = value(
          await commitChanges(h, [
            {
              type: 'review',
              gate: gate as Gate,
              scope,
              approved: true,
              operator: '測試製片人',
              note: '逐步驗收',
            },
          ]),
        );
  }
  return { h, d, s, scope, video };
}
async function zipNames(file: string) {
  return new Promise<string[]>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (e, z) => {
      if (e || !z) return reject(e);
      const names: string[] = [];
      z.on('error', reject);
      z.on('entry', (entry) => {
        names.push(entry.fileName);
        z.readEntry();
      });
      z.on('end', () => resolve(names));
      z.readEntry();
    }),
  );
}
it('exports a reviewed fourteen-step episode with media and UTF-8 subtitle files', async () => {
  const { h, d, scope } = await fixture();
  const file = path.join(d, 'release.zip');
  value(await exportRelease(h, scope, file));
  const names = await zipNames(file);
  expect(names.some((n) => n.endsWith('.srt'))).toBe(true);
  expect(names.some((n) => n.endsWith('.vtt'))).toBe(true);
  expect(names.filter((n) => n.startsWith('media/'))).toHaveLength(2);
}, 20000);
it('rejects changed rights, expired compliance and stale upstream approvals', async () => {
  const { h, d, s, scope, video } = await fixture();
  value(
    await commitChanges(h, [
      {
        type: 'asset',
        assetId: video.id,
        status: 'rejected',
        reason: '重做',
        rights: 'licensed',
        licenseNote: '原創',
      },
    ]),
  );
  expect((await exportRelease(h, scope, path.join(d, 'bad.zip'))).ok).toBe(false);
  value(
    await commitChanges(h, [
      {
        type: 'asset',
        assetId: video.id,
        status: 'accepted',
        reason: '',
        rights: 'licensed',
        licenseNote: '原創',
      },
    ]),
  );
  const first = latestRevision(s, s.template.steps[0].id, scope)!;
  value(
    await commitChanges(h, [
      {
        type: 'revision',
        stepId: first.stepId,
        scope,
        content: first.content,
        inputs: [],
        expectedRevisionId: first.id,
      },
    ]),
  );
  expect((await exportRelease(h, scope, path.join(d, 'stale.zip'))).ok).toBe(false);
  expect(fs.existsSync(path.join(d, 'stale.zip'))).toBe(false);
}, 20000);
it('release cannot substitute the approved master or platform', async () => {
  const { h, d, s, scope } = await fixture();
  const r = latestRevision(s, s.template.steps.find((t) => t.key === '13')!.id, scope)!;
  const changed = await commitChanges(h, [
    {
      type: 'revision',
      stepId: r.stepId,
      scope,
      content: { ...r.content, fields: { ...r.content.fields, platform: 'unreviewed-platform' } },
      inputs: r.inputs,
      expectedRevisionId: r.id,
    },
  ]);
  value(changed);
  expect((await exportRelease(h, scope, path.join(d, 'wrong-platform.zip'))).ok).toBe(false);
}, 20000);
it('expired soundtrack rights block release even when the master is licensed', async () => {
  const { h, d, s, scope } = await fixture();
  const audio = s.assets.find((a) => a.kind === 'audio')!;
  value(
    await commitChanges(h, [
      {
        type: 'asset',
        assetId: audio.id,
        status: 'accepted',
        reason: '',
        rights: 'expired',
        licenseNote: 'expired',
      },
    ]),
  );
  expect((await exportRelease(h, scope, path.join(d, 'expired-audio.zip'))).ok).toBe(false);
}, 20000);
it('release cannot use a cover image as the reviewed video master', async () => {
  const { h, d, s, scope } = await fixture();
  const r = latestRevision(s, s.template.steps.find((t) => t.key === '13')!.id, scope)!;
  value(
    await commitChanges(h, [
      {
        type: 'revision',
        stepId: r.stepId,
        scope,
        content: {
          ...r.content,
          fields: {
            ...r.content.fields,
            masterAsset: s.assets.find((a) => a.kind === 'image')!.id,
          },
        },
        inputs: r.inputs,
        expectedRevisionId: r.id,
      },
    ]),
  );
  expect((await exportRelease(h, scope, path.join(d, 'wrong-master.zip'))).ok).toBe(false);
}, 20000);
