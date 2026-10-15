import React, { useState } from 'react';
import { uid, type Row } from '../../../shared/model';
import { getTools, validateCustomTool } from '../../../domain/tools/catalog';
export function ToolManager({ rows, onSave }: { rows: Row[]; onSave: (rows: Row[]) => void }) {
  const [draft, setDraft] = useState<Row>({
    id: uid(),
    name: '',
    category: '自訂',
    steps: '06,07',
    url: '',
  });
  const [error, setError] = useState('');
  const put = (r: Row) => onSave([...rows.filter((t) => t.id !== r.id), r]);
  return (
    <>
      <p className="muted">新增或更新人工製作工具。API接入需要個別開發與驗證，請勿填入金鑰。</p>
      {[
        ['name', '工具名稱'],
        ['category', '分類'],
        ['steps', '適用步驟（逗號分隔，如 06,07）'],
        ['url', '官方 HTTPS 網址'],
      ].map(([k, label]) => (
        <label className="field" key={k}>
          <span>{label}</span>
          <input value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        </label>
      ))}
      {error && <div className="warning">{error}</div>}
      <button
        className="primary full-button"
        onClick={() => {
          const issues = validateCustomTool(draft);
          if (issues.length) {
            setError(issues.map((i) => i.message).join('；'));
            return;
          }
          put(draft);
          setDraft({ id: uid(), name: '', category: '自訂', steps: '06,07', url: '' });
          setError('');
        }}
      >
        儲存工具
      </button>
      <div className="tool-list">
        {getTools(rows)
          .filter((t) => t.id !== 'manual')
          .map((t) => (
            <div className="backup-row" key={t.id}>
              <span>{t.name}</span>
              <div>
                <button
                  onClick={() =>
                    setDraft({
                      id: t.id,
                      name: t.name,
                      category: t.category,
                      steps: t.steps.join(','),
                      url: t.url,
                    })
                  }
                >
                  編輯
                </button>{' '}
                <button onClick={() => put({ id: t.id, archived: 'true' })}>封存</button>
              </div>
            </div>
          ))}
        {rows
          .filter((t) => t.archived === 'true')
          .map((t) => (
            <div className="backup-row" key={t.id}>
              <span>{t.id}（已封存）</span>
              <button onClick={() => onSave(rows.filter((r) => r.id !== t.id))}>還原預設</button>
            </div>
          ))}
      </div>
    </>
  );
}
