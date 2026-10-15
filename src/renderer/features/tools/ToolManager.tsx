import React, { useState } from 'react';
import { uid, type Row } from '../../../shared/model';
import { API_PROTOCOLS, getTools, validateCustomTool } from '../../../domain/tools/catalog';
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
      <p className="muted">
        按製作需要預留文字、圖像、影片或聲音模型接口。設定隨專案保存；實際生成須完成對應接口接入與驗證。請勿填入金鑰。
      </p>
      <label className="field">
        <span>使用方式</span>
        <select
          value={draft.mode || 'manual'}
          onChange={(e) =>
            setDraft({
              ...draft,
              mode: e.target.value,
              apiProtocol: draft.apiProtocol || 'openai-compatible',
            })
          }
        >
          <option value="manual">人工操作</option>
          <option value="api-reserved">預留 AI 接口（待接入）</option>
        </select>
      </label>
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
      {draft.mode === 'api-reserved' && (
        <>
          <label className="field">
            <span>接口類型</span>
            <select
              value={draft.apiProtocol || 'openai-compatible'}
              onChange={(e) => setDraft({ ...draft, apiProtocol: e.target.value })}
            >
              {Object.entries(API_PROTOCOLS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {[
            ['apiBaseUrl', 'API 基礎地址（可稍後填寫）', 'https://api.example.com/v1'],
            ['apiModel', '模型 ID／工作流 ID（可稍後填寫）', '填入服務商提供的精確 ID'],
          ].map(([key, label, placeholder]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                value={draft[key] || ''}
                placeholder={placeholder}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          <p className="muted">
            僅保存接口預留設定，不發送生成請求。不同模型可各建一項，再於製作步驟的「工具」頁選擇。
          </p>
        </>
      )}
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
              <span>
                {t.name}
                {t.mode === 'api-reserved' && (
                  <small> · AI 接口待接入 · {t.api?.model || '模型待選擇'}</small>
                )}
              </span>
              <div>
                <button
                  onClick={() =>
                    setDraft({
                      id: t.id,
                      name: t.name,
                      category: t.category,
                      steps: t.steps.join(','),
                      url: t.url,
                      mode: t.mode,
                      apiProtocol: t.api?.protocol || 'openai-compatible',
                      apiBaseUrl: t.api?.baseUrl || '',
                      apiModel: t.api?.model || '',
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
