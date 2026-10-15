import React, { useState } from 'react';
import { TemplateSchema, type WorkflowTemplate } from '../../../shared/model';
import { applyTemplateEdit, diffTemplates } from '../../../domain/workflow/template-operations';
export function TemplateManager({
  template,
  onSave,
}: {
  template: WorkflowTemplate;
  onSave: (t: WorkflowTemplate) => void;
}) {
  const [from, setFrom] = useState(template.steps[0].id),
    [to, setTo] = useState(template.steps[1].id),
    [json, setJson] = useState(''),
    [error, setError] = useState('');
  return (
    <details>
      <summary>流程名稱、依賴及模板交換</summary>
      {template.steps.map((s) => (
        <label className="field" key={s.id}>
          <span>{s.key} 節點名稱</span>
          <input
            defaultValue={s.title}
            key={s.id + s.title}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== s.title)
                onSave({
                  ...template,
                  version: template.version + 1,
                  steps: template.steps.map((x) =>
                    x.id === s.id ? { ...x, title: e.target.value.trim() } : x,
                  ),
                });
            }}
          />
        </label>
      ))}
      <div className="inline-controls">
        <select aria-label="依賴來源" value={from} onChange={(e) => setFrom(e.target.value)}>
          {template.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <select aria-label="依賴目標" value={to} onChange={(e) => setTo(e.target.value)}>
          {template.steps.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            const r = applyTemplateEdit(template, { type: 'connect', from, to });
            if (r.ok) {
              onSave(r.value);
              setError('');
            } else setError(r.error.message);
          }}
        >
          新增依賴
        </button>
      </div>
      {template.edges.map((e) => (
        <div className="backup-row" key={e.from + e.to}>
          <span>
            {template.steps.find((s) => s.id === e.from)?.title} →{' '}
            {template.steps.find((s) => s.id === e.to)?.title}
          </span>
          <button
            onClick={() =>
              onSave({
                ...template,
                version: template.version + 1,
                edges: template.edges.filter((x) => x !== e),
              })
            }
          >
            移除依賴
          </button>
        </div>
      ))}
      <button onClick={() => setJson(JSON.stringify(template, null, 2))}>複製模板到下方</button>
      <button
        onClick={() =>
          void window.drama.saveText('workflow-template.json', JSON.stringify(template, null, 2))
        }
      >
        匯出模板 JSON
      </button>
      <label className="field">
        <span>貼上模板 JSON（預覽後明確套用）</span>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} />
      </label>
      <button
        onClick={() => {
          try {
            const candidate = TemplateSchema.parse(JSON.parse(json));
            if (template.steps.some((s) => !candidate.steps.some((c) => c.id === s.id)))
              throw Error('不可移除既有節點身份，請使用封存');
            const diff = diffTemplates(template, candidate);
            if (
              window.confirm(
                `新增 ${diff.added.length}、修改 ${diff.changed.length} 個節點；將更新依賴並建立流程 v${template.version + 1}。套用？`,
              )
            ) {
              onSave({ ...candidate, id: template.id, version: template.version + 1 });
              setError('');
            }
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        預覽並套用模板
      </button>
      {error && <p className="warning">{error}</p>}
    </details>
  );
}
