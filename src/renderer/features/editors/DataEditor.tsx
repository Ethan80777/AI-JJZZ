import React from 'react';
import { uid, type StepContent } from '../../../shared/model';
import { FIELDS } from '../../../domain/workflow/fields';
export function DataEditor({
  kind,
  content,
  onChange,
}: {
  kind: string;
  content: StepContent;
  onChange: (c: StepContent) => void;
}) {
  const config = FIELDS[kind] ?? FIELDS.text;
  return (
    <div className="data-editor">
      <div className="field-grid">
        {config.fields.map((f) => (
          <label className={f.multiline ? 'field wide' : 'field'} key={f.key}>
            <span>{f.label}</span>
            {f.multiline ? (
              <textarea
                aria-label={f.label}
                rows={4}
                placeholder={f.placeholder || '在這裡展開你的創作…'}
                value={content.fields[f.key] ?? ''}
                onChange={(e) =>
                  onChange({ ...content, fields: { ...content.fields, [f.key]: e.target.value } })
                }
              />
            ) : (
              <input
                aria-label={f.label}
                placeholder={f.placeholder || f.label}
                value={content.fields[f.key] ?? ''}
                onChange={(e) =>
                  onChange({ ...content, fields: { ...content.fields, [f.key]: e.target.value } })
                }
              />
            )}
          </label>
        ))}
      </div>
      {config.columns.length > 0 && (
        <>
          <div className="section-heading">
            <h3>
              {config.rowLabel}清單 <small>{content.rows.length}</small>
            </h3>
            <button
              className="subtle"
              onClick={() =>
                onChange({
                  ...content,
                  rows: [
                    ...content.rows,
                    { id: uid(), ...Object.fromEntries(config.columns.map((c) => [c.key, ''])) },
                  ],
                })
              }
            >
              ＋ 新增{config.rowLabel}
            </button>
          </div>
          {!content.rows.length ? (
            <div className="empty-inline">
              尚未新增{config.rowLabel}。從第一筆開始，把想法變成可交付的內容。
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    {config.columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {content.rows.map((row, i) => (
                    <tr key={row.id || i}>
                      <td className="row-number">{String(i + 1).padStart(2, '0')}</td>
                      {config.columns.map((c) => (
                        <td key={c.key}>
                          <textarea
                            aria-label={`${c.label} ${i + 1}`}
                            rows={2}
                            value={row[c.key] ?? ''}
                            onChange={(e) =>
                              onChange({
                                ...content,
                                rows: content.rows.map((r, n) =>
                                  n === i ? { ...r, [c.key]: e.target.value } : r,
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          title="移除這一列"
                          className="icon-button"
                          onClick={() =>
                            onChange({ ...content, rows: content.rows.filter((_, n) => n !== i) })
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
