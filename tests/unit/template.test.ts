import { describe, it, expect } from 'vitest';
import { createDefaultTemplate, newProject } from '../../src/domain/workflow/default-template';
import { ManifestSchema, TemplateSchema, StepContentSchema } from '../../src/shared/model';
describe('production template', () => {
  it('contains five acts and fourteen unique editable steps', () => {
    const t = createDefaultTemplate();
    expect(t.acts.map((a) => a.stepIds.length)).toEqual([2, 3, 4, 3, 2]);
    expect(new Set(t.steps.map((s) => s.id)).size).toBe(14);
    expect(t.steps.map((s) => s.key)).toEqual(
      Array.from({ length: 14 }, (_, i) => String(i + 1).padStart(2, '0')),
    );
  });
  it('rejects duplicate IDs and unknown content types', () => {
    const t = createDefaultTemplate();
    t.steps[1].id = t.steps[0].id;
    expect(TemplateSchema.safeParse(t).success).toBe(false);
    expect(StepContentSchema.safeParse({ kind: 'unknown', fields: {}, rows: [] }).success).toBe(
      false,
    );
  });
  it('rejects invalid manifests and gives new projects independent identities', () => {
    expect(
      ManifestSchema.safeParse({ version: 1, id: 'bad', name: 'x', assets: 'x.assets' }).success,
    ).toBe(false);
    expect(newProject('A').project.id).not.toBe(newProject('A').project.id);
  });
});
