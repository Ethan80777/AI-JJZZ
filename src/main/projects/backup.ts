import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { pipeline } from 'node:stream/promises';
import { Writable } from 'node:stream';
import { ok, uid, now, type Result } from '../../shared/model';
import { session, errorResult } from './project-service';
import { readSnapshot, writeSnapshot } from './database';
import { inside, atomicWrite } from './manifest';
export type BackupRecord = { id: string; createdAt: string; relativePath: string; sha256: string };
export async function hashFile(file: string) {
  const hash = crypto.createHash('sha256');
  await pipeline(
    fs.createReadStream(file),
    new Writable({
      write(chunk, _, cb) {
        hash.update(chunk);
        cb();
      },
    }),
  );
  return hash.digest('hex');
}
export function listBackups(h: string): BackupRecord[] {
  const root = session(h).root;
  return fs
    .readdirSync(inside(root, 'backups'))
    .filter((n) => n.endsWith('.json'))
    .map((n) => JSON.parse(fs.readFileSync(inside(root, 'backups/' + n), 'utf8')) as BackupRecord)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createBackup(h: string, keep?: number): Promise<Result<BackupRecord>> {
  let temp = '';
  try {
    const s = session(h);
    const count = keep ?? readSnapshot(s.db).project.backupRetention;
    if (!Number.isInteger(count) || count < 1 || count > 100) throw Error('備份保留數須為1–100');
    const id = uid();
    const file = inside(s.root, `backups/${id}.sqlite`);
    temp = file + '.tmp';
    await s.db.backup(temp);
    const check = new Database(temp, { readonly: true });
    try {
      if (check.pragma('integrity_check', { simple: true }) !== 'ok') throw Error('備份驗證失敗');
      readSnapshot(check);
    } finally {
      check.close();
    }
    fs.renameSync(temp, file);
    const b = {
      id,
      createdAt: now(),
      relativePath: `backups/${id}.sqlite`,
      sha256: await hashFile(file),
    };
    atomicWrite(file + '.json', JSON.stringify(b));
    for (const old of listBackups(h).slice(count)) {
      fs.rmSync(inside(s.root, old.relativePath), { force: true });
      fs.rmSync(inside(s.root, old.relativePath + '.json'), { force: true });
    }
    return ok(b);
  } catch (e) {
    if (temp && fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    return errorResult(e);
  }
}
export async function restoreBackup(h: string, id: string) {
  try {
    const s = session(h);
    const record = listBackups(h).find((b) => b.id === id);
    if (!record) throw Error('備份不存在');
    const file = inside(s.root, record.relativePath);
    if ((await hashFile(file)) !== record.sha256) throw Error('備份內容校驗失敗');
    const db = new Database(file, { readonly: true });
    let snapshot;
    try {
      snapshot = readSnapshot(db);
    } finally {
      db.close();
    }
    const safety = await createBackup(h);
    if (!safety.ok) return safety;
    writeSnapshot(s.db, snapshot);
    return ok(snapshot);
  } catch (e) {
    return errorResult(e);
  }
}
