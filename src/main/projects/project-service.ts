import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  ok,
  err,
  uid,
  now,
  ChangeSchema,
  latestRevision,
  type ProjectHandle,
  type ProjectSnapshot,
  type ProjectChange,
  type Result,
} from '../../shared/model';
import { newProject } from '../../domain/workflow/default-template';
import { readManifest, atomicWrite, inside } from './manifest';
import { initialize, readSnapshot, writeSnapshot } from './database';
import { acquireLock } from './project-lock';
import { collectAffectedRevisions, evaluateGate } from '../../domain/workflow/gates';
import { checkToolBinding, getTools, validateCustomTool } from '../../domain/tools/catalog';
export type Session = { file: string; root: string; db: Database.Database; release: () => void };
const sessions = new Map<string, Session>();
export function session(handle: string): Session {
  const s = sessions.get(handle);
  if (!s) throw Error('專案已關閉或不存在');
  return s;
}
export function errorResult(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return err(
    m === 'PROJECT_BUSY' ? 'PROJECT_BUSY' : m === 'CONFLICT' ? 'CONFLICT' : 'PROJECT_ERROR',
    m,
  );
}
export async function createProject(file: string, name: string): Promise<Result<ProjectHandle>> {
  let root = '';
  try {
    if (!file.endsWith('.aidrama')) throw Error('請使用 .aidrama 副檔名');
    if (fs.existsSync(file)) throw Error('專案檔已存在');
    root = file.slice(0, -8) + '.assets';
    if (fs.existsSync(root)) throw Error('資產目錄已存在');
    fs.mkdirSync(root);
    for (const folder of ['media', 'exports', 'backups']) fs.mkdirSync(path.join(root, folder));
    const s = newProject(name.trim() || '未命名劇集');
    const db = new Database(path.join(root, 'project.sqlite'));
    try {
      initialize(db);
      writeSnapshot(db, s);
    } finally {
      db.close();
    }
    atomicWrite(
      file,
      JSON.stringify(
        { version: 1, id: s.project.id, name: s.project.name, assets: path.basename(root) },
        null,
        2,
      ),
    );
    return openProject(file);
  } catch (e) {
    return errorResult(e);
  }
}
export async function openProject(file: string): Promise<Result<ProjectHandle>> {
  let release: (() => void) | undefined;
  let db: Database.Database | undefined;
  try {
    const { manifest, root } = readManifest(file);
    const dbPath = inside(root, 'project.sqlite');
    if (!fs.existsSync(dbPath)) throw Error('資產資料庫遺失，請重新定位資產目錄');
    release = acquireLock(root);
    db = new Database(dbPath, { fileMustExist: true });
    if (db.pragma('user_version', { simple: true }) !== 1) throw Error('不支援此資料庫版本');
    const snapshot = readSnapshot(db);
    if (snapshot.project.id !== manifest.id) throw Error('專案與資產目錄不相符');
    const handle = uid();
    sessions.set(handle, { file: fs.realpathSync(file), root, db, release });
    return ok(handle);
  } catch (e) {
    db?.close();
    release?.();
    return errorResult(e);
  }
}
export async function readProject(h: ProjectHandle): Promise<Result<ProjectSnapshot>> {
  try {
    return ok(readSnapshot(session(h).db));
  } catch (e) {
    return errorResult(e);
  }
}
export function saveSnapshot(h: string, s: ProjectSnapshot) {
  writeSnapshot(session(h).db, s);
}
export async function commitChanges(
  h: ProjectHandle,
  changes: ProjectChange[],
): Promise<Result<ProjectSnapshot>> {
  try {
    const db = session(h).db;
    const s = readSnapshot(db);
    for (const raw of changes) {
      const c = ChangeSchema.parse(raw);
      switch (c.type) {
        case 'revision': {
          const step = s.template.steps.find((x) => x.id === c.stepId);
          if (!step || step.key !== c.content.kind) throw Error('內容與步驟不符');
          const last = latestRevision(s, c.stepId, c.scope);
          if ((last?.id ?? null) !== c.expectedRevisionId) throw Error('CONFLICT');
          if (c.inputs.some((id) => !s.revisions.some((r) => r.id === id)))
            throw Error('引用的修訂不存在');
          if (last) {
            const affected = new Set(collectAffectedRevisions(s, last.id));
            for (const r of s.revisions) if (affected.has(r.id)) r.stale = true;
          }
          s.revisions.push({
            id: uid(),
            stepId: c.stepId,
            scope: c.scope,
            createdAt: now(),
            content: c.content,
            inputs: c.inputs,
            previousId: last?.id ?? null,
            stale: false,
          });
          break;
        }
        case 'canvas':
          s.canvas = c.canvas;
          break;
        case 'template':
          if (
            s.template.steps.some(
              (step) => !c.template.steps.some((t) => t.id === step.id && t.key === step.key),
            )
          )
            throw Error('請封存既有節點，不可移除或改變內容類型');
          if (JSON.stringify(s.template.edges) !== JSON.stringify(c.template.edges))
            for (const r of s.revisions) r.stale = true;
          s.template = { ...c.template, id: s.template.id, version: s.template.version + 1 };
          break;
        case 'locale': {
          const i = s.localeVariants.findIndex((v) => v.id === c.locale.id);
          if (i < 0) s.localeVariants.push(c.locale);
          else {
            s.localeHistory.push(structuredClone(s.localeVariants[i]));
            s.localeVariants[i] = c.locale;
          }
          for (const r of s.revisions.filter(
            (r) =>
              r.content.kind === '11' &&
              (r.scope.kind === 'project' || r.scope.episodeId === c.locale.episodeId),
          )) {
            r.stale = true;
            const affected = new Set(collectAffectedRevisions(s, r.id));
            for (const downstream of s.revisions)
              if (affected.has(downstream.id)) downstream.stale = true;
          }
          break;
        }
        case 'retention':
          s.project.backupRetention = c.count;
          break;
        case 'records':
          if (
            c.collection === 'toolCatalog' &&
            c.rows.some((r) => r.archived !== 'true' && validateCustomTool(r).length)
          )
            throw Error('工具設定不合法');
          s[c.collection] = c.rows;
          break;
        case 'asset': {
          const a = s.assets.find((a) => a.id === c.assetId);
          if (!a) throw Error('資產不存在');
          Object.assign(a, {
            status: c.status,
            reason: c.reason,
            rights: c.rights,
            licenseNote: c.licenseNote,
          });
          break;
        }
        case 'binding': {
          const step = s.template.steps.find((x) => x.id === c.stepId);
          const tool = getTools(s.toolCatalog).find((x) => x.id === c.toolId);
          if (!step || !tool || checkToolBinding(step.key, tool, c.parameters).length)
            throw Error('工具不相容或尚未接入');
          s.toolBindings.push({
            id: uid(),
            stepId: c.stepId,
            toolId: c.toolId,
            parameters: c.parameters,
            createdAt: now(),
          });
          break;
        }
        case 'review': {
          const evaluation = evaluateGate(s, c.gate, c.scope);
          if (c.approved && !evaluation.eligible)
            throw Error(evaluation.issues.map((x) => x.message).join('；'));
          s.reviews.push({
            id: uid(),
            gate: c.gate,
            scope: c.scope,
            approved: c.approved,
            operator: c.operator,
            note: c.note,
            revisionIds: evaluation.revisionIds,
            createdAt: now(),
          });
          break;
        }
      }
    }
    writeSnapshot(db, s);
    return ok(s);
  } catch (e) {
    return errorResult(e);
  }
}
export async function closeProject(h: ProjectHandle): Promise<Result<void>> {
  const s = sessions.get(h);
  if (s) {
    s.db.close();
    s.release();
    sessions.delete(h);
  }
  return ok(undefined);
}
export async function closeAll() {
  for (const h of sessions.keys()) await closeProject(h);
}
