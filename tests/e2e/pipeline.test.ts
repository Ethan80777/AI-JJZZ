import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { FIELDS } from '../../src/domain/workflow/fields';
import { GATE_STEPS } from '../../src/domain/workflow/gates';
test('real desktop IPC completes fourteen steps, reviews, release, backup restore and reopen', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-'));
  const project = path.join(root, '原創 示範.aidrama');
  const launch = () =>
    electron.launch({
      executablePath: process.env.DRAMA_EXECUTABLE,
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--user-data-dir=' + path.join(root, 'user'),
        ...(process.env.DRAMA_EXECUTABLE ? [] : [path.resolve('out/main/index.js')]),
      ],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':99' },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    }, project);
    const created = await page.evaluate(async () => window.drama.create('原創示範'));
    if (!created.ok) throw Error(created.error.message);
    const h = created.value.handle;
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=64x64:d=1',
      '-c:v',
      'libx264',
      path.join(root, 'video.mp4'),
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
      path.join(root, 'cover.png'),
    ]);
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      path.join(root, 'audio.wav'),
    ]);
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
      },
      ['video.mp4', 'cover.png', 'audio.wav'].map((f) => path.join(root, f)),
    );
    const result = await page.evaluate(
      async ({ h, FIELDS, GATE_STEPS }) => {
        const unwrap = <T>(r: import('../../src/shared/model').Result<T>): T => {
          if (!r.ok) throw Error(r.error.message);
          return r.value;
        };
        let s = unwrap(await window.drama.importAssets(h));
        const video = s.assets.find((a) => a.kind === 'video')!,
          cover = s.assets.find((a) => a.kind === 'image')!,
          audio = s.assets.find((a) => a.kind === 'audio')!;
        for (const a of s.assets)
          s = unwrap(
            await window.drama.commit(h, [
              {
                type: 'asset',
                assetId: a.id,
                status: 'accepted',
                reason: '原創測試',
                rights: 'licensed',
                licenseNote: '自行生成',
              },
            ]),
          );
        const episodeId = crypto.randomUUID(),
          scope = { kind: 'episode' as const, episodeId };
        s = unwrap(
          await window.drama.commit(h, [
            { type: 'records', collection: 'episodes', rows: [{ id: episodeId, name: 'E01' }] },
          ]),
        );
        for (const tag of ['fr', 'ar'])
          s = unwrap(
            await window.drama.commit(h, [
              {
                type: 'locale',
                locale: {
                  id: crypto.randomUUID(),
                  tag,
                  sourceId: null,
                  episodeId,
                  terms: [
                    {
                      id: crypto.randomUUID(),
                      source: 'Hello',
                      target: tag === 'ar' ? 'مرحباً' : 'Bonjour',
                    },
                  ],
                  cues: [
                    {
                      id: crypto.randomUUID(),
                      startMs: 0,
                      endMs: 1000,
                      text: tag === 'ar' ? 'مرحباً 2026' : 'Bonjour 2026',
                    },
                  ],
                  notes: '人工示例',
                },
              },
            ]),
          );
        for (const step of s.template.steps) {
          const fields = Object.fromEntries(
            FIELDS[step.key].fields.map((f) => [f.key, '原創示例']),
          );
          Object.assign(fields, {
            duration: '1',
            tolerance: '0',
            masterAsset: video.id,
            coverAsset: cover.id,
            platform: 'manual',
            market: 'TW',
          });
          const row = Object.fromEntries(FIELDS[step.key].columns.map((f) => [f.key, '原創示例']));
          Object.assign(row, {
            id: crypto.randomUUID(),
            duration: '1',
            in: '0',
            out: '1',
            status: 'licensed',
            source: '原創',
            expires: '2099-01-01',
            assetId:
              step.key === '08' || step.key === '10'
                ? video.id
                : step.key === '09'
                  ? audio.id
                  : cover.id,
            startAsset: cover.id,
            endAsset: cover.id,
          });
          const inputs = s.template.edges
            .filter((e) => e.to === step.id)
            .map((e) => s.revisions.filter((r) => r.stepId === e.from).at(-1)!.id);
          s = unwrap(
            await window.drama.commit(h, [
              {
                type: 'revision',
                stepId: step.id,
                scope,
                content: { kind: step.key, fields, rows: [row] },
                inputs,
                expectedRevisionId: null,
              },
            ]),
          );
          for (const [gate, keys] of Object.entries(GATE_STEPS))
            if (keys.at(-1) === step.key)
              s = unwrap(
                await window.drama.commit(h, [
                  {
                    type: 'review',
                    gate: gate as import('../../src/shared/model').Gate,
                    scope,
                    approved: true,
                    operator: '驗收製片',
                    note: '人工驗收',
                  },
                ]),
              );
        }
        unwrap(await window.drama.backup(h));
        const backups = unwrap(await window.drama.backups(h));
        unwrap(
          await window.drama.commit(h, [
            {
              type: 'records',
              collection: 'metrics',
              rows: [{ metric: 'retention', numerator: '50', denominator: '100' }],
            },
          ]),
        );
        s = unwrap(await window.drama.restore(h, backups[0].id));
        return {
          scope,
          revisions: s.revisions.length,
          reviews: s.reviews.length,
          assets: s.assets.map((a) => a.sha256),
          metrics: s.metrics.length,
        };
      },
      { h, FIELDS, GATE_STEPS },
    );
    expect(result.revisions).toBe(14);
    expect(result.reviews).toBe(8);
    expect(result.metrics).toBe(0);
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      },
      path.join(root, 'release.zip'),
    );
    const released = await page.evaluate(({ h, scope }) => window.drama.release(h, scope), {
      h,
      scope: result.scope,
    });
    expect(released.ok).toBe(true);
    // Reload attaches React to the project created through formal IPC, then close gracefully.
    await page.reload();
    await expect(page.locator('.flow-card')).toHaveCount(14);
    const closed = app.waitForEvent('close', { timeout: 10000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await closed;
    expect(fs.existsSync(path.join(root, '原創 示範.assets', '.writer-lock'))).toBe(false);
    app = await launch();
    page = await app.firstWindow();
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, project);
    const reopened = await page.evaluate(() => window.drama.open());
    expect(reopened.ok).toBe(true);
    if (reopened.ok) {
      expect(reopened.value.snapshot.revisions).toHaveLength(14);
      expect(reopened.value.snapshot.assets.map((a) => a.sha256)).toEqual(result.assets);
    }
  } finally {
    app.process().kill('SIGKILL');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
