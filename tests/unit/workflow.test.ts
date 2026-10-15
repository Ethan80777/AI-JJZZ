import { it, expect } from 'vitest';
import { newProject } from '../../src/domain/workflow/default-template';
import { applyTemplateEdit } from '../../src/domain/workflow/template-operations';
import { collectAffectedRevisions, evaluateGate } from '../../src/domain/workflow/gates';
import { uid, now, type ArtifactRevision } from '../../src/shared/model';
it('custom steps persist stable identities and cycles are rejected', () => {
  const s = newProject('test'),
    t = s.template;
  const r = applyTemplateEdit(t, {
    type: 'add',
    actId: t.acts[0].id,
    title: '我的工作',
    kind: 'text',
  });
  expect(r.ok && r.value.steps.length).toBe(15);
  expect(t.steps.length).toBe(14);
  const cycle = applyTemplateEdit(t, { type: 'connect', from: t.steps[1].id, to: t.steps[0].id });
  expect(cycle.ok).toBe(false);
});
it('only downstream revision consumers become stale', () => {
  const s = newProject('x');
  const rev = (n: number, inputs: string[]): ArtifactRevision => ({
    id: uid(),
    stepId: s.template.steps[n].id,
    scope: { kind: 'project' },
    createdAt: now(),
    content: { kind: s.template.steps[n].key, fields: {}, rows: [] },
    inputs,
    previousId: null,
    stale: false,
  });
  const a = rev(0, []),
    b = rev(1, [a.id]),
    c = rev(2, [b.id]),
    d = rev(3, []);
  s.revisions = [a, b, c, d];
  expect(collectAffectedRevisions(s, a.id)).toEqual([b.id, c.id]);
});
it('archived required steps and other-episode approvals do not bypass gates', () => {
  const s = newProject('x');
  s.template.steps[0].archived = true;
  const gate = evaluateGate(s, 'G1', { kind: 'episode', episodeId: uid() });
  expect(gate.eligible).toBe(false);
  expect(gate.issues.length).toBeGreaterThan(0);
});
it('a later gate revalidates an archived previously approved requirement', () => {
  const s = newProject('x');
  for (const step of s.template.steps.slice(0, 5))
    s.revisions.push({
      id: uid(),
      stepId: step.id,
      scope: { kind: 'project' },
      createdAt: now(),
      content: {
        kind: step.key,
        fields: { market: 'US', title: 'Story', synopsis: 'Story', episode: 'E01' },
        rows: [{ id: uid() }],
      },
      inputs: [],
      previousId: null,
      stale: false,
    });
  s.reviews.push({
    id: uid(),
    gate: 'G1',
    scope: { kind: 'project' },
    revisionIds: s.revisions.slice(0, 2).map((r) => r.id),
    approved: true,
    operator: 'producer',
    note: '',
    createdAt: now(),
  });
  s.template.steps[0].archived = true;
  expect(
    evaluateGate(s, 'G2', { kind: 'project' }).issues.some((i) => i.code === 'PREVIOUS_GATE'),
  ).toBe(true);
});
it('template schemas reject dangling edges and cycles', async () => {
  const { TemplateSchema } = await import('../../src/shared/model');
  const t = newProject('x').template;
  expect(
    TemplateSchema.safeParse({ ...t, edges: [{ from: t.steps[0].id, to: uid() }] }).success,
  ).toBe(false);
  expect(
    TemplateSchema.safeParse({
      ...t,
      edges: [...t.edges, { from: t.steps[1].id, to: t.steps[0].id }],
    }).success,
  ).toBe(false);
});
it('storyboard duration mismatch and missing production assets block review', async () => {
  const { validateStep } = await import('../../src/domain/workflow/gates');
  const s = newProject('x');
  for (const key of ['05', '08'] as const) {
    const step = s.template.steps.find((t) => t.key === key)!;
    s.revisions.push({
      id: uid(),
      stepId: step.id,
      scope: { kind: 'project' },
      createdAt: now(),
      content: {
        kind: key,
        fields: { episode: 'E01', duration: '90', direction: 'Manual' },
        rows: [{ duration: '10' }],
      },
      inputs: [],
      previousId: null,
      stale: false,
    });
    expect(validateStep(s, step.id, { kind: 'project' }).length).toBeGreaterThan(0);
  }
});
