import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { latestRevision, ok, uid, type Scope } from '../../shared/model';
import { evaluateGate } from '../../domain/workflow/gates';
import { session, errorResult } from './project-service';
import { readSnapshot } from './database';
import { inside } from './manifest';
import { hashFile } from './backup';
import { serializeSubtitles } from '../../domain/localization/subtitles';
export async function exportRelease(handle: string, scope: Scope, destination: string) {
  const temp = destination + '.' + uid() + '.tmp';
  try {
    if (fs.existsSync(destination)) throw Error('檔案已存在');
    const s = session(handle),
      snapshot = readSnapshot(s.db);
    const check = evaluateGate(snapshot, 'G8', scope);
    const review = snapshot.reviews
      .filter((r) => r.gate === 'G8' && JSON.stringify(r.scope) === JSON.stringify(scope))
      .at(-1);
    if (
      !check.eligible ||
      !review?.approved ||
      check.revisionIds.some((id) => !review.revisionIds.includes(id))
    )
      throw Error('G8 未通過目前版本審核');
    const step = snapshot.template.steps.find((s) => s.key === '13')!;
    const release = latestRevision(snapshot, step.id, scope);
    if (!release || release.stale) throw Error('發行資料未完成或已過期');
    const f = release.content.fields;
    for (const key of ['title', 'platform', 'account', 'masterAsset', 'coverAsset'])
      if (!f[key]) throw Error('發行資料缺少：' + key);
    const approvedMasterStep = snapshot.template.steps.find((t) => t.key === '10' && !t.custom)!;
    const approvedComplianceStep = snapshot.template.steps.find(
      (t) => t.key === '12' && !t.custom,
    )!;
    const approvedMaster = latestRevision(snapshot, approvedMasterStep.id, scope);
    const compliance = latestRevision(snapshot, approvedComplianceStep.id, scope);
    if (f.masterAsset !== approvedMaster?.content.fields.masterAsset)
      throw Error('發行母版與 G6 已審核版本不符');
    if (
      f.platform !== compliance?.content.fields.platform ||
      f.market !== compliance?.content.fields.market
    )
      throw Error('發行平台／市場與 G8 已審核範圍不符');
    const assets = [f.masterAsset, f.coverAsset].map((id) =>
      snapshot.assets.find((a) => a.id === id),
    );
    if (assets.some((a) => !a || a.status !== 'accepted' || a.rights !== 'licensed'))
      throw Error('母版／封面必須通過素材及授權審核');
    if (assets[0]?.kind !== 'video' || assets[1]?.kind !== 'image')
      throw Error('母版必須是影片，封面必須是圖片');
    const zip = new ZipFile();
    for (const a of assets) {
      const file = inside(s.root, a!.relativePath);
      if ((await hashFile(file)) !== a!.sha256) throw Error('素材內容已改變');
      zip.addFile(file, 'media/' + a!.id + '-' + a!.name, { compress: false });
    }
    const locales = snapshot.localeVariants.filter(
      (v) =>
        scope.kind === 'project' ||
        (v.episodeId === scope.episodeId && (scope.kind !== 'locale' || v.id === scope.localeId)),
    );
    for (const locale of locales) {
      for (const format of ['srt', 'vtt', 'json'] as const)
        zip.addBuffer(
          Buffer.from(serializeSubtitles(locale.cues, format), 'utf8'),
          `subtitles/${locale.id}.${format}`,
        );
    }
    zip.addBuffer(
      Buffer.from(
        JSON.stringify(
          {
            project: snapshot.project.name,
            scope,
            release: release.content,
            review,
            assets,
            locales,
            rights: snapshot.revisions.filter(
              (r) => r.content.kind === '12' && check.revisionIds.includes(r.id),
            ),
          },
          null,
          2,
        ),
      ),
      'release.json',
    );
    zip.end();
    await pipeline(zip.outputStream, fs.createWriteStream(temp, { flags: 'wx' }));
    fs.renameSync(temp, destination);
    return ok(destination);
  } catch (e) {
    return errorResult(e);
  } finally {
    if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
  }
}
