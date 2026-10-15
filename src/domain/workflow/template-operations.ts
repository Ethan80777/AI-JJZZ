import { ok, err, uid, type WorkflowTemplate, type StepContent } from '../../shared/model';
type Edit =
  | { type: 'add'; actId: string; title: string; kind: StepContent['kind'] }
  | { type: 'archive' | 'restore'; stepId: string }
  | { type: 'connect'; from: string; to: string };
export function applyTemplateEdit(template: WorkflowTemplate, edit: Edit) {
  const t = structuredClone(template);
  if (edit.type === 'add') {
    const act = t.acts.find((a) => a.id === edit.actId);
    if (!act) return err('ACT', '幕次不存在');
    const id = uid();
    t.steps.push({
      id,
      key: edit.kind,
      actId: act.id,
      title: edit.title,
      description: '自訂製作工作',
      custom: true,
      archived: false,
    });
    act.stepIds.push(id);
  } else if (edit.type === 'connect') {
    if (!t.steps.some((s) => s.id === edit.from) || !t.steps.some((s) => s.id === edit.to))
      return err('STEP', '步驟不存在');
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === edit.from) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return t.edges.filter((e) => e.from === id).some((e) => visit(e.to));
    };
    if (visit(edit.to)) return err('CYCLE', '依賴不可形成循環');
    if (!t.edges.some((e) => e.from === edit.from && e.to === edit.to))
      t.edges.push({ from: edit.from, to: edit.to });
  } else {
    const s = t.steps.find((s) => s.id === edit.stepId);
    if (!s) return err('STEP', '步驟不存在');
    s.archived = edit.type === 'archive';
  }
  t.version++;
  return ok(t);
}
export function diffTemplates(a: WorkflowTemplate, b: WorkflowTemplate) {
  return {
    fromVersion: a.version,
    toVersion: b.version,
    added: b.steps.filter((s) => !a.steps.some((p) => p.id === s.id)),
    changed: b.steps.filter((s) =>
      a.steps.some((p) => p.id === s.id && JSON.stringify(p) !== JSON.stringify(s)),
    ),
  };
}
