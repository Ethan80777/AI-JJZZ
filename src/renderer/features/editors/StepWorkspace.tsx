import React, { useEffect, useRef, useState } from 'react';
import {
  latestRevision,
  type ProjectSnapshot,
  type ProjectChange,
  type StepContent,
  type Scope,
  type Gate,
} from '../../../shared/model';
import { FIELDS } from '../../../domain/workflow/fields';
import { DataEditor } from './DataEditor';
import { SaveQueue } from './save-queue';
import { GATE_STEPS, evaluateGate, validateStep } from '../../../domain/workflow/gates';
import { getTools } from '../../../domain/tools/catalog';
import { exportStoryboard } from '../../../domain/storyboard/export';
import { calculateCostScenarios } from '../../../domain/finance/costs';
import { computeMetric } from '../../../domain/distribution/metrics';
import { LocaleEditor } from '../locales/LocaleEditor';
import { AssetLibrary } from '../assets/AssetLibrary';
export function StepWorkspace({
  snapshot,
  handle,
  stepId,
  scope,
  commit,
  onClose,
  setFlush,
  notify,
  onImportAssets,
  onRefresh,
}: {
  snapshot: ProjectSnapshot;
  handle: string;
  stepId: string;
  scope: Scope;
  commit: (changes: ProjectChange[]) => Promise<boolean>;
  onClose: () => void;
  setFlush: (fn: () => Promise<boolean>) => void;
  notify: (s: string) => void;
  onImportAssets: () => void;
  onRefresh: (s: ProjectSnapshot) => void;
}) {
  const step = snapshot.template.steps.find((s) => s.id === stepId)!;
  const act = snapshot.template.acts.find((a) => a.id === step.actId)!;
  const revision = latestRevision(snapshot, stepId, scope);
  const [content, setContent] = useState<StepContent>(
    revision?.content ?? { kind: step.key, fields: {}, rows: [] },
  );
  const [tab, setTab] = useState('工作內容');
  const [saveState, setSaveState] = useState('saved');
  const [operator, setOperator] = useState('製片人');
  const [note, setNote] = useState('');
  const [showAssets, setShowAssets] = useState(false);
  const ref = useRef({ snapshot, commit });
  ref.current = { snapshot, commit };
  const childFlushes = useRef(new Map<string, () => Promise<boolean>>());
  const queue = useRef<SaveQueue<StepContent> | null>(null);
  if (!queue.current)
    queue.current = new SaveQueue(async (c) => {
      const s = ref.current.snapshot;
      const latest = latestRevision(s, stepId, scope);
      const inputs = s.template.edges
        .filter((e) => e.to === stepId)
        .map((e) => latestRevision(s, e.from, scope)?.id)
        .filter((i): i is string => !!i);
      if (
        !(await ref.current.commit([
          {
            type: 'revision',
            stepId,
            scope,
            content: c,
            inputs,
            expectedRevisionId: latest?.id ?? null,
          },
        ]))
      )
        throw Error('save failed');
      const saved = await window.drama.read(handle);
      if (saved.ok) ref.current.snapshot = saved.value;
    }, setSaveState);
  const flushWorkspace = async () => {
    for (const flush of childFlushes.current.values()) if (!(await flush())) return false;
    return queue.current!.flush();
  };
  useEffect(() => {
    setFlush(flushWorkspace);
    return () => {
      queue.current!.cancelPending();
      setFlush(async () => true);
    };
  }, []);
  const update = (c: StepContent) => {
    setContent(c);
    queue.current!.put(c);
  };
  const gate = (Object.keys(GATE_STEPS) as Gate[]).find((g) => GATE_STEPS[g].includes(step.key));
  const validation = validateStep(snapshot, stepId, scope);
  const binding = snapshot.toolBindings.filter((b) => b.stepId === stepId).at(-1);
  const tools = getTools(snapshot.toolCatalog);
  const tool = tools.find((t) => t.id === binding?.toolId) ?? tools[0];
  const scenarios = calculateCostScenarios(
    content.rows,
    content.fields.revenue ?? '',
    content.fields.currency || 'USD',
  );
  const result = scenarios.estimated;
  const exportText = async (name: string, text: string) => {
    if (!(await flushWorkspace())) return;
    const r = await window.drama.saveText(name, text);
    if (r.ok) notify('已匯出：' + r.value);
    else if (r.error.code !== 'CANCELLED') notify(r.error.message);
  };
  return (
    <section className="workspace" style={{ '--accent': act.color } as React.CSSProperties}>
      <div className="workspace-head">
        <div>
          <span className="eyebrow">
            {act.title} / STEP {step.key}
          </span>
          <h2>{step.title}</h2>
          <p>{step.description}</p>
        </div>
        <button className="icon-button close-button" onClick={onClose} aria-label="關閉編輯器">
          ×
        </button>
      </div>
      <div className="editor-status">
        <span className={'save-dot ' + saveState} />
        {saveState === 'saved'
          ? '已儲存到本機'
          : saveState === 'saving'
            ? '儲存中…'
            : saveState === 'error'
              ? '儲存失敗 · 內容仍保留'
              : '有未儲存變更'}
        {saveState === 'error' && <button onClick={() => void flushWorkspace()}>重試儲存</button>}
        <small>修訂 {snapshot.revisions.filter((r) => r.stepId === stepId).length}</small>
      </div>
      <nav className="editor-tabs">
        {['輸入', '工作內容', '工具', '輸出', '檢查', '歷史'].map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="workspace-body">
        {tab === '工作內容' && (
          <>
            {revision?.stale && (
              <div className="warning">
                上游內容已有新版本。請檢查本步驟並重新保存，以更新引用。
              </div>
            )}
            <DataEditor kind={step.key} content={content} onChange={update} />
            {step.key === '01' && (
              <div className="finance-grid">
                <div>
                  <small>實際已發生成本</small>
                  <strong>
                    {scenarios.actual.totalCost} {content.fields.currency || 'USD'}
                  </strong>
                </div>
                <div>
                  <small>估算製作成本</small>
                  <strong>
                    {result.totalCost} {content.fields.currency || 'USD'}
                  </strong>
                </div>
                <div>
                  <small>預估 ROI</small>
                  <strong>
                    {result.roi === null ? '—' : (Number(result.roi) * 100).toFixed(1) + '%'}
                  </strong>
                </div>
                <div>
                  <small>回收倍數</small>
                  <strong>
                    {result.recoveryMultiple === null
                      ? '—'
                      : Number(result.recoveryMultiple).toFixed(2) + '×'}
                  </strong>
                </div>
                {result.missingInputs.map((m) => (
                  <p className="warning" key={m}>
                    {m}
                  </p>
                ))}
              </div>
            )}
            {['06', '07', '08', '09', '10'].includes(step.key) && (
              <>
                <button className="full-button" onClick={() => setShowAssets(!showAssets)}>
                  {showAssets ? '收合' : '開啟'}資產庫 · {snapshot.assets.length} 個素材
                </button>
                {showAssets && (
                  <AssetLibrary
                    handle={handle}
                    assets={snapshot.assets}
                    onImport={onImportAssets}
                    setFlush={(fn) => {
                      childFlushes.current.set('assets', fn);
                    }}
                    onChange={(c) => commit([c])}
                    onRepair={(id) =>
                      void window.drama
                        .repair(handle, id)
                        .then((r) => (r.ok ? onRefresh(r.value) : notify(r.error.message)))
                    }
                  />
                )}
              </>
            )}
            {step.key === '11' && (
              <LocaleEditor
                episodeId={scope.kind === 'project' ? snapshot.project.id : scope.episodeId}
                variants={snapshot.localeVariants.filter(
                  (v) =>
                    v.episodeId ===
                    (scope.kind === 'project' ? snapshot.project.id : scope.episodeId),
                )}
                setFlush={(fn) => {
                  childFlushes.current.set('locale', fn);
                }}
                onSave={(v) => commit([{ type: 'locale', locale: v }])}
                onExport={exportText}
              />
            )}
            {step.key === '14' && (
              <>
                <button
                  className="full-button"
                  onClick={() =>
                    void window.drama
                      .importMetrics(handle)
                      .then((r) => (r.ok ? onRefresh(r.value) : notify(r.error.message)))
                  }
                >
                  匯入數據 CSV
                </button>
                <div className="metrics-chart">
                  {[...content.rows, ...snapshot.metrics].map((r, i) => {
                    const value = computeMetric(Number(r.numerator), Number(r.denominator));
                    return (
                      <div className="metric-row" key={i}>
                        <span>
                          {r.episode} {r.locale} · {r.metric}
                        </span>
                        <div>
                          <i style={{ width: Math.min(100, (value ?? 0) * 100) + '%' }} />
                        </div>
                        <b>{value === null ? '—' : (value * 100).toFixed(1) + '%'}</b>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
        {tab === '輸入' && (
          <>
            <h3>上游交付物</h3>
            <p className="muted">每次保存都會記錄引用的確切修訂，更新來源不會覆蓋舊成果。</p>
            {snapshot.template.edges
              .filter((e) => e.to === stepId)
              .map((e) => {
                const upstream = snapshot.template.steps.find((t) => t.id === e.from);
                const r = latestRevision(snapshot, e.from, scope);
                return (
                  <div className="input-card" key={e.from}>
                    <strong>
                      {upstream?.key} · {upstream?.title}
                    </strong>
                    <small>{r ? '已引用版本 · ' + r.createdAt : '尚無交付物，可先草擬內容'}</small>
                    {r && (
                      <pre>
                        {Object.entries(r.content.fields)
                          .map(
                            ([k, v]) =>
                              `${FIELDS[r.content.kind]?.fields.find((f) => f.key === k)?.label ?? k}：${v}`,
                          )
                          .join('\n')}
                      </pre>
                    )}
                  </div>
                );
              })}
            {!snapshot.template.edges.some((e) => e.to === stepId) && (
              <div className="empty-inline">這是流程起點。從你的故事構想與市場資料開始。</div>
            )}
          </>
        )}
        {tab === '工具' && (
          <>
            <div className="callout">
              <span>目前使用</span>
              <h3>{tool.name}</h3>
              <p>人工操作 · API 尚未接入。匯出提示詞與交付物後，可在工具中製作再匯入成果。</p>
            </div>
            <div className="tool-list">
              {tools
                .filter((t) => t.steps.includes(step.key))
                .map((t) => (
                  <div key={t.id} className={'tool-row ' + (t.id === tool.id ? 'selected' : '')}>
                    <div className="tool-symbol">{t.name.slice(0, 1)}</div>
                    <div>
                      <strong>{t.name}</strong>
                      <small>
                        {t.category} · {t.id === 'manual' ? '本機編輯' : '能力待查證'}
                      </small>
                    </div>
                    <button
                      onClick={() =>
                        void commit([{ type: 'binding', stepId, toolId: t.id, parameters: {} }])
                      }
                    >
                      {t.id === tool.id ? '已選擇' : '選擇'}
                    </button>
                    {t.url && (
                      <button
                        className="icon-button"
                        title="開啟工具網站"
                        onClick={() => void window.drama.openExternal(t.url)}
                      >
                        ↗
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}
        {tab === '輸出' && (
          <>
            <h3>交付物匯出</h3>
            <p className="muted">保留可編輯資料與版本紀錄，交接給下一個製作環節。</p>
            <div className="export-grid">
              <button
                onClick={() =>
                  void exportText(
                    `${step.key}-${step.title}.json`,
                    JSON.stringify(content, null, 2),
                  )
                }
              >
                <strong>JSON</strong>
                <span>完整結構化交付物</span>↗
              </button>
              <button
                onClick={() =>
                  void exportText(
                    `${step.key}-${step.title}.csv`,
                    exportStoryboard(content.rows, 'csv'),
                  )
                }
              >
                <strong>CSV</strong>
                <span>表格與分鏡清單</span>↗
              </button>
              <button
                onClick={() =>
                  void exportText(
                    `${step.key}-${step.title}.md`,
                    `# ${step.title}\n\n` +
                      Object.entries(content.fields)
                        .map(
                          ([k, v]) =>
                            `## ${FIELDS[step.key]?.fields.find((f) => f.key === k)?.label ?? k}\n\n${v}`,
                        )
                        .join('\n\n') +
                      '\n\n```json\n' +
                      JSON.stringify(content.rows, null, 2) +
                      '\n```',
                  )
                }
              >
                <strong>Markdown</strong>
                <span>可閱讀的工作文件</span>↗
              </button>
            </div>
            {step.key === '13' && (
              <button
                className="primary full-button"
                onClick={async () => {
                  if (!(await flushWorkspace())) return;
                  const r = await window.drama.release(handle, scope);
                  notify(r.ok ? '發行包已匯出；尚未上架。' : r.error.message);
                }}
              >
                檢查 G8 並匯出發行包
              </button>
            )}
          </>
        )}
        {tab === '檢查' && (
          <>
            <h3>交付物檢查</h3>
            {validation.length ? (
              validation.map((i, n) => (
                <div className="check-row" key={n}>
                  <span>○</span>
                  {i.message}
                </div>
              ))
            ) : (
              <div className="check-row success">✓ 基本內容檢查通過；仍需人工確認品質</div>
            )}
            {gate && (
              <div className="gate-card">
                <span className="eyebrow">QUALITY GATE</span>
                <h3>{gate} · 階段審核</h3>
                {evaluateGate(snapshot, gate, scope).issues.map((i, n) => (
                  <p className="warning" key={n}>
                    {i.message}
                  </p>
                ))}
                <label className="field">
                  <span>審核人（本機工作紀錄）</span>
                  <input value={operator} onChange={(e) => setOperator(e.target.value)} />
                </label>
                <label className="field">
                  <span>審核備註</span>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                </label>
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={async () => {
                      if (await flushWorkspace())
                        await commit([
                          { type: 'review', gate, scope, approved: true, operator, note },
                        ]);
                    }}
                  >
                    確認通過
                  </button>
                  <button
                    onClick={() =>
                      void commit([
                        { type: 'review', gate, scope, approved: false, operator, note },
                      ])
                    }
                  >
                    退回修改
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {tab === '歷史' && (
          <>
            {snapshot.revisions
              .filter((r) => r.stepId === stepId)
              .reverse()
              .map((r, i) => (
                <div className="history-card" key={r.id}>
                  <span className="history-dot" />
                  <div>
                    <strong>
                      {i === 0 ? '目前修訂' : '歷史修訂'} {r.stale && '· 來源已更新'}
                    </strong>
                    <small>
                      {new Date(r.createdAt).toLocaleString()} · {r.scope.kind}
                    </small>
                    <p>
                      {Object.values(r.content.fields).join(' · ').slice(0, 180) || '結構化交付物'}
                    </p>
                    <button
                      onClick={() => {
                        update(structuredClone(r.content));
                        setTab('工作內容');
                      }}
                    >
                      以此內容建立新修訂
                    </button>
                  </div>
                </div>
              ))}
            {!revision && <div className="empty-inline">編輯並保存後，版本歷史會顯示在這裡。</div>}
          </>
        )}
      </div>
      <footer className="workspace-footer">
        <span>{tool.name} · 人工製作</span>
        <button
          className="primary"
          onClick={() => {
            queue.current!.put(content);
            void flushWorkspace();
          }}
        >
          儲存工作
        </button>
      </footer>
    </section>
  );
}
