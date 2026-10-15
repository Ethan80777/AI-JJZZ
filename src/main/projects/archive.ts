import fs from 'node:fs';
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { ZipFile } from 'yazl';
import yauzl from 'yauzl';
import { uid, ok, type Result, type ProjectHandle } from '../../shared/model';
import { session, openProject, closeProject, errorResult } from './project-service';
import { inside, readManifest } from './manifest';
import { hashFile } from './backup';
import { readSnapshot } from './database';
export type ArchiveReport = { fileCount: number; totalBytes: number; sha256: string };
export async function exportProject(
  h: string,
  destination: string,
): Promise<Result<ArchiveReport>> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'drama-export-'));
  const partial = destination + '.' + uid() + '.tmp';
  try {
    if (fs.existsSync(destination)) throw Error('匯出檔已存在');
    const s = session(h);
    const manifest = readManifest(s.file).manifest;
    await s.db.backup(path.join(temp, 'project.sqlite'));
    const entries: [string, string][] = [
      [s.file, 'project.aidrama'],
      [path.join(temp, 'project.sqlite'), `${manifest.assets}/project.sqlite`],
    ];
    const backupDb = new Database(path.join(temp, 'project.sqlite'), { readonly: true });
    let snapshot;
    try {
      snapshot = readSnapshot(backupDb);
    } finally {
      backupDb.close();
    }
    for (const a of snapshot.assets) {
      const file = inside(s.root, a.relativePath);
      if ((await hashFile(file)) !== a.sha256) throw Error('資產雜湊不符：' + a.name);
      entries.push([file, `${manifest.assets}/${a.relativePath}`]);
    }
    const checksums: Record<string, string> = {};
    let totalBytes = 0;
    for (const [file, name] of entries) {
      checksums[name] = await hashFile(file);
      totalBytes += fs.statSync(file).size;
    }
    const zip = new ZipFile();
    for (const [file, name] of entries) zip.addFile(file, name, { compress: false });
    zip.addBuffer(Buffer.from(JSON.stringify(checksums)), 'checksums.json');
    zip.end();
    await pipeline(zip.outputStream, fs.createWriteStream(partial, { flags: 'wx' }));
    const sha256 = await hashFile(partial);
    fs.renameSync(partial, destination);
    return ok({ fileCount: entries.length, totalBytes, sha256 });
  } catch (e) {
    return errorResult(e);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
    fs.rmSync(partial, { force: true });
  }
}
export async function importProject(
  archivePath: string,
  destinationDir: string,
  limits: { maxBytes?: number; maxEntries?: number } = {},
): Promise<Result<ProjectHandle>> {
  let temp = '';
  try {
    if (fs.existsSync(destinationDir)) throw Error('目的目錄已存在');
    temp = fs.mkdtempSync(path.join(path.dirname(destinationDir), '.drama-import-'));
    const seen = new Set<string>();
    let total = 0,
      count = 0;
    const max = limits.maxBytes ?? 100 * 1024 ** 3;
    await new Promise<void>((resolve, reject) => {
      yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (error, zip) => {
        if (error || !zip) {
          reject(error);
          return;
        }
        let failed = false;
        const fail = (e: unknown) => {
          if (!failed) {
            failed = true;
            zip.close();
            reject(e);
          }
        };
        zip.on('error', fail);
        zip.on('end', () => {
          if (!failed) resolve();
        });
        zip.on('entry', (entry: yauzl.Entry) => {
          void (async () => {
            const name = entry.fileName;
            if (++count > (limits.maxEntries ?? 100000)) throw Error('壓縮包項目過多');
            const mode = entry.externalFileAttributes >>> 16;
            if ((mode & 0o170000) === 0o120000) throw Error('壓縮包含符號連結');
            if (name.endsWith('/')) {
              inside(temp, name);
              zip.readEntry();
              return;
            }
            const key = name.normalize('NFC').toLowerCase();
            if (seen.has(key)) throw Error('重複或大小寫衝突路徑');
            seen.add(key);
            const target = inside(temp, name);
            if (
              entry.uncompressedSize > 20 * 1024 ** 3 ||
              entry.uncompressedSize / Math.max(1, entry.compressedSize) > 1000
            )
              throw Error('壓縮包超過大小或壓縮比限制');
            const space = fs.statfsSync(temp);
            if (entry.uncompressedSize > space.bavail * space.bsize) throw Error('磁碟空間不足');
            fs.mkdirSync(path.dirname(target), { recursive: true });
            await new Promise<void>((done, bad) =>
              zip.openReadStream(entry, (e, stream) => {
                if (e || !stream) {
                  bad(e);
                  return;
                }
                let bytes = 0;
                const guard = new Transform({
                  transform(chunk, _, cb) {
                    bytes += chunk.length;
                    total += chunk.length;
                    if (total > max || bytes > 20 * 1024 ** 3) cb(Error('展開內容超過限制'));
                    else cb(null, chunk);
                  },
                });
                pipeline(stream, guard, fs.createWriteStream(target, { flags: 'wx' })).then(
                  () => done(),
                  bad,
                );
              }),
            );
            zip.readEntry();
          })().catch(fail);
        });
        zip.readEntry();
      });
    });
    const checkFile = inside(temp, 'checksums.json');
    if (fs.statSync(checkFile).size > 20 * 1024 ** 2) throw Error('校驗清單過大');
    const sums = JSON.parse(fs.readFileSync(checkFile, 'utf8')) as Record<string, string>;
    if (!sums || Array.isArray(sums) || typeof sums !== 'object') throw Error('無效校驗清單');
    if (seen.size !== Object.keys(sums).length + 1) throw Error('壓縮包含未列出的檔案');
    const { manifest, root } = readManifest(inside(temp, 'project.aidrama'));
    for (const [name, hash] of Object.entries(sums)) {
      if (
        name !== 'project.aidrama' &&
        name !== `${manifest.assets}/project.sqlite` &&
        !name.startsWith(`${manifest.assets}/media/`)
      )
        throw Error('壓縮包含非專案檔案');
      if ((await hashFile(inside(temp, name))) !== hash) throw Error('壓縮包校驗失敗');
    }
    for (const d of ['media', 'exports', 'backups'])
      fs.mkdirSync(inside(root, d), { recursive: true });
    const validated = await openProject(path.join(temp, 'project.aidrama'));
    if (!validated.ok) throw Error(validated.error.message);
    await closeProject(validated.value);
    fs.renameSync(temp, destinationDir);
    temp = '';
    return openProject(path.join(destinationDir, 'project.aidrama'));
  } catch (e) {
    return errorResult(e);
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
}
