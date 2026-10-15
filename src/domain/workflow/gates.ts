import {
  latestRevision,
  sameScope,
  type ProjectSnapshot,
  type Gate,
  type Scope,
  type ValidationIssue,
} from '../../shared/model';
import { FIELDS } from './fields';
export const GATE_STEPS: Record<Gate, string[]> = {
  G1: ['01', '02'],
  G2: ['03', '04', '05'],
  G3: ['06'],
  G4: ['07'],
  G5: ['08', '09'],
  G6: ['10'],
  G7: ['11'],
  G8: ['12'],
};
export function collectAffectedRevisions(s: ProjectSnapshot, id: string): string[] {
  const affected = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of s.revisions)
      if (!affected.has(r.id) && r.inputs.some((i) => affected.has(i))) {
        affected.add(r.id);
        changed = true;
      }
  }
  return [...affected].filter((i) => i !== id);
}
export function validateStep(s: ProjectSnapshot, stepId: string, scope: Scope): ValidationIssue[] {
  const step = s.template.steps.find((x) => x.id === stepId);
  const r = latestRevision(s, stepId, scope);
  const issues: ValidationIssue[] = [];
  const add = (message: string) => issues.push({ code: 'INCOMPLETE', message, stepId });
  if (!step || step.archived) add('必要步驟已封存或不存在');
  if (!r) {
    add('尚未保存此範圍的交付物');
    return issues;
  }
  if (r.stale) add('來源已更新，請重新確認引用');
  const config = FIELDS[r.content.kind];
  for (const field of config?.fields.slice(0, 1) ?? [])
    if (!r.content.fields[field.key]?.trim()) add('請填寫「' + field.label + '」');
  if (config?.columns.length && !r.content.rows.length) add('至少新增一筆' + config.rowLabel);
  if (r.inputs.some((id) => !s.revisions.some((x) => x.id === id && !x.stale)))
    add('上游引用不存在或已過期');
  for (const row of r.content.rows)
    for (const key of ['assetId', 'startAsset', 'endAsset'])
      if (row[key] && !s.assets.some((a) => a.id === row[key])) add('資產引用不存在：' + row[key]);
  if (r.content.kind === '05') {
    const duration = Number(r.content.fields.duration || '90'),
      tolerance = Number(r.content.fields.tolerance || '5');
    const lengths = r.content.rows.map((row) => Number(row.duration));
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isFinite(tolerance) ||
      tolerance < 0 ||
      lengths.some((n) => !Number.isFinite(n) || n <= 0)
    )
      add('分鏡時長必須是正數，容差不得小於零');
    else if (Math.abs(lengths.reduce((a, b) => a + b, 0) - duration) > tolerance)
      add('分鏡總時長超出目標容差');
  }
  const mediaKeys: Record<string, string[]> = {
    '06': ['assetId'],
    '07': ['startAsset', 'endAsset'],
    '08': ['assetId'],
    '09': ['assetId'],
    '10': ['assetId'],
  };
  for (const row of r.content.rows)
    for (const key of mediaKeys[r.content.kind] ?? []) {
      const a = s.assets.find((a) => a.id === row[key]);
      if (!a || a.status !== 'accepted') add('素材尚未通過審核：' + key);
      else if (
        (r.content.kind === '07' && a.kind !== 'image') ||
        (r.content.kind === '08' && a.kind !== 'video') ||
        (r.content.kind === '09' && a.kind !== 'audio')
      )
        add('素材類型與步驟不符');
    }
  if (r.content.kind === '10') {
    const master = s.assets.find((a) => a.id === r.content.fields.masterAsset);
    if (!master || master.kind !== 'video' || master.status !== 'accepted')
      add('缺少已通過審核的影片母版');
    for (const row of r.content.rows) {
      const a = s.assets.find((a) => a.id === row.assetId),
        start = Number(row.in),
        end = Number(row.out);
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        (a?.durationMs != null && end * 1000 > a.durationMs)
      )
        add('剪輯入點／出點超出素材範圍');
    }
  }
  if (r.content.kind === '12') {
    for (const row of r.content.rows) {
      if (row.status !== 'licensed') add('授權／政策尚未確認：' + (row.item || '未命名'));
      if (!row.source) add('缺少授權／政策來源');
      if (row.expires && row.expires < new Date().toISOString().slice(0, 10)) add('授權已到期');
    }
  }
  return issues;
}
export function evaluateGate(s: ProjectSnapshot, gate: Gate, scope: Scope) {
  const issues: ValidationIssue[] = [];
  const revisionIds: string[] = [];
  for (const key of GATE_STEPS[gate]) {
    const step = s.template.steps.find((x) => x.key === key && !x.custom);
    if (!step) {
      issues.push({ code: 'MISSING', message: '必要步驟不存在：' + key });
      continue;
    }
    issues.push(...validateStep(s, step.id, scope));
    const r = latestRevision(s, step.id, scope);
    if (r) revisionIds.push(r.id);
  }
  const gates = Object.keys(GATE_STEPS) as Gate[];
  const previous = gates.slice(0, gates.indexOf(gate));
  for (const g of previous) {
    const review = s.reviews.filter((r) => r.gate === g && sameScope(r.scope, scope)).at(-1);
    const current = GATE_STEPS[g]
      .map((k) => s.template.steps.find((t) => t.key === k && !t.custom))
      .filter(Boolean)
      .map((step) => latestRevision(s, step!.id, scope));
    if (
      !review?.approved ||
      GATE_STEPS[g].some((k) => {
        const step = s.template.steps.find((t) => t.key === k && !t.custom);
        return !step || validateStep(s, step.id, scope).length > 0;
      }) ||
      current.some((r) => !r || r.stale || !review.revisionIds.includes(r.id))
    )
      issues.push({ code: 'PREVIOUS_GATE', message: g + ' 尚未通過目前版本的審核' });
  }
  if (gate === 'G8') {
    const production = s.template.steps.filter(
      (t) => ['05', '06', '07', '08', '09', '10'].includes(t.key) && !t.custom,
    );
    for (const step of production) {
      const r = latestRevision(s, step.id, scope);
      if (!r) continue;
      const ids = [
        r.content.fields.masterAsset,
        ...r.content.rows.flatMap((row) => [row.assetId, row.startAsset, row.endAsset]),
      ].filter(Boolean);
      for (const id of new Set(ids))
        if (s.assets.find((a) => a.id === id)?.rights !== 'licensed')
          issues.push({
            code: 'RIGHTS',
            stepId: step.id,
            message: '製作鏈素材授權尚未確認或已到期：' + id,
          });
    }
  }
  return { eligible: issues.length === 0, issues, revisionIds };
}
