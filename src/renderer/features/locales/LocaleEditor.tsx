import { useDraftRecords, type FlushSetter } from '../editors/useDraftRecords';
import React, { useState } from 'react';
import { uid, type LocaleVariant } from '../../../shared/model';
import {
  LOCALES,
  createLocaleVariant,
  serializeSubtitles,
  validateSubtitles,
} from '../../../domain/localization/subtitles';
export function LocaleEditor({
  variants: persistedVariants,
  setFlush,
  episodeId,
  onSave,
  onExport,
}: {
  variants: LocaleVariant[];
  setFlush?: FlushSetter;
  episodeId: string;
  onSave: (v: LocaleVariant) => Promise<boolean | void> | boolean | void;
  onExport: (name: string, text: string) => void;
}) {
  const draft = useDraftRecords(persistedVariants, onSave, setFlush);
  const variants = draft.rows;
  const [selected, setSelected] = useState(variants[0]?.id ?? '');
  const [target, setTarget] = useState('en');
  const current = variants.find((v) => v.id === selected) ?? variants[0];
  const [error, setError] = useState('');
  const update = draft.update;
  const create = () => {
    try {
      const base = current ?? {
        id: uid(),
        tag: 'zh-Hant',
        sourceId: null,
        episodeId,
        terms: [],
        cues: [],
        notes: '',
      };
      const v = createLocaleVariant(base, target);
      if (!current) v.sourceId = null;
      update(v);
      setSelected(v.id);
      setError('');
    } catch {
      setError('請輸入有效的語言標籤，例如 en、fr-CA 或 ar。');
    }
  };
  const issues = current
    ? validateSubtitles(current.cues, { maxCharsPerSecond: 20, maxLines: 2 })
    : [];
  return (
    <section className="locale-editor">
      {draft.failed && (
        <button className="warning" onClick={() => void draft.flush()}>
          儲存失敗，重試（輸入已保留）
        </button>
      )}
      {draft.saving && <p role="status">語言版本儲存中…</p>}
      <div className="section-heading">
        <h3>
          語言版本 <small>{variants.length}</small>
        </h3>
        <div className="inline-controls">
          <input
            aria-label="目標語言"
            list="locales"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <datalist id="locales">
            {LOCALES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </datalist>
          <button onClick={create}>＋ 建立版本</button>
        </div>
      </div>
      {error && <div className="warning">{error}</div>}
      <div className="chips">
        {variants.map((v) => (
          <button
            className={v.id === current?.id ? 'chip active' : 'chip'}
            key={v.id}
            onClick={() => setSelected(v.id)}
          >
            {v.tag}
            <small>{v.episodeId}</small>
          </button>
        ))}
      </div>
      {current ? (
        <>
          <h3>本版本術語表</h3>
          {current.terms.map((term, i) => (
            <div className="inline-controls" key={term.id}>
              {['source', 'target', 'pronunciation', 'notes'].map((key) => (
                <input
                  aria-label={`術語${i + 1} ${key}`}
                  key={key}
                  value={term[key] || ''}
                  onChange={(e) =>
                    update({
                      ...current,
                      terms: current.terms.map((t, n) =>
                        n === i ? { ...t, [key]: e.target.value } : t,
                      ),
                    })
                  }
                />
              ))}
              <button
                onClick={() =>
                  update({ ...current, terms: current.terms.filter((_, n) => n !== i) })
                }
              >
                移除
              </button>
            </div>
          ))}
          <button
            onClick={() =>
              update({
                ...current,
                terms: [
                  ...current.terms,
                  { id: uid(), source: '', target: '', pronunciation: '', notes: '' },
                ],
              })
            }
          >
            新增版本術語
          </button>
          <label className="field">
            <span>文化創譯紀錄</span>
            <textarea
              value={current.notes}
              onChange={(e) => update({ ...current, notes: e.target.value })}
            />
          </label>
          <div
            className="subtitle-preview"
            data-testid="subtitle-preview"
            dir={/^(ar|he|fa|ur)(-|$)/.test(current.tag) ? 'rtl' : 'ltr'}
          >
            <span className="preview-label">字幕預覽 · {current.tag}</span>
            <p>{current.cues[0]?.text || '預覽你的第一段字幕'}</p>
          </div>
          <div className="section-heading">
            <h3>字幕與時碼</h3>
            <button
              className="subtle"
              onClick={() =>
                update({
                  ...current,
                  cues: [
                    ...current.cues,
                    {
                      id: uid(),
                      startMs: current.cues.at(-1)?.endMs ?? 0,
                      endMs: (current.cues.at(-1)?.endMs ?? 0) + 3000,
                      text: '',
                    },
                  ],
                })
              }
            >
              新增字幕
            </button>
          </div>
          {current.cues.map((c, i) => (
            <div className="subtitle-row" key={c.id}>
              <span>{String(i + 1).padStart(2, '0')}</span>
              <input
                aria-label={`字幕${i + 1}開始毫秒`}
                type="number"
                min="0"
                value={c.startMs}
                onChange={(e) =>
                  update({
                    ...current,
                    cues: current.cues.map((x) =>
                      x.id === c.id ? { ...x, startMs: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <span>→</span>
              <input
                aria-label={`字幕${i + 1}結束毫秒`}
                type="number"
                min="0"
                value={c.endMs}
                onChange={(e) =>
                  update({
                    ...current,
                    cues: current.cues.map((x) =>
                      x.id === c.id ? { ...x, endMs: Number(e.target.value) } : x,
                    ),
                  })
                }
              />
              <textarea
                aria-label={`字幕${i + 1}文字`}
                dir="auto"
                value={c.text}
                onChange={(e) =>
                  update({
                    ...current,
                    cues: current.cues.map((x) =>
                      x.id === c.id ? { ...x, text: e.target.value } : x,
                    ),
                  })
                }
              />
              <button
                className="icon-button"
                onClick={() =>
                  update({ ...current, cues: current.cues.filter((x) => x.id !== c.id) })
                }
              >
                ×
              </button>
            </div>
          ))}
          {issues.map((i, n) => (
            <div className="warning" key={n}>
              {i.message}
            </div>
          ))}
          <div className="button-row">
            {(['srt', 'vtt', 'json'] as const).map((f) => (
              <button
                key={f}
                onClick={async () => {
                  if (!(await draft.flush())) return;
                  try {
                    onExport(`${current.tag}.${f}`, serializeSubtitles(current.cues, f));
                    setError('');
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                匯出 {f.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="empty-inline">建立第一個語言版本，開始字幕與文化創譯。</div>
      )}
    </section>
  );
}
