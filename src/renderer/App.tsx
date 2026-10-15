import { TemplateManager } from './features/canvas/TemplateManager';
import React, { useEffect, useRef, useState } from 'react';
import { WorkflowCanvas } from './features/canvas/WorkflowCanvas';
import { StepWorkspace } from './features/editors/StepWorkspace';
import { AssetLibrary } from './features/assets/AssetLibrary';
import { applyTemplateEdit } from '../domain/workflow/template-operations';
import { getTools } from '../domain/tools/catalog';
import {
  latestRevision,
  uid,
  type ProjectSnapshot,
  type ProjectChange,
  type Result,
  type Scope,
} from '../shared/model';
import type { OpenedProject } from '../shared/ipc';
import { ToolManager } from './features/tools/ToolManager';
import './styles.css';
const labels = ['一', '二', '三', '四', '五'];
export function App() {
  const [project, setProject] = useState<OpenedProject | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'canvas' | 'assets' | 'tools'>('canvas');
  const [scope, setScope] = useState<Scope>({ kind: 'project' });
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<'create' | 'custom' | 'backups' | 'episodes' | 'tools' | null>(
    null,
  );
  const [name, setName] = useState('');
  const [customKind, setCustomKind] = useState('text');
  const [actId, setActId] = useState('');
  const [backups, setBackups] = useState<{ id: string; createdAt: string }[]>([]);
  const [recent, setRecent] = useState<{ name: string; path: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  const flush = useRef<() => Promise<boolean>>(async () => true);
  const flushers = useRef(new Map<string, () => Promise<boolean>>());
  flush.current = async () => {
    for (const fn of flushers.current.values()) if (!(await fn())) return false;
    return true;
  };
  const projectRef = useRef(project);
  projectRef.current = project;
  const notify = (message: string) => {
    setToast(message);
  };
  const handleResult = <T,>(r: Result<T>, success: (v: T) => void) => {
    if (r.ok) success(r.value);
    else if (r.error.code !== 'CANCELLED') notify(r.error.message);
  };
  useEffect(() => {
    if (!window.drama) return;
    void window.drama.initial().then((r) => handleResult(r, (p) => setProject(p)));
    void window.drama.recent().then((r) => {
      if (r.ok) setRecent(r.value);
    });
    return window.drama.onCloseRequest(async () => {
      const saved = await flush.current();
      if (saved) return true;
      return window.confirm('儲存失敗。確定捨棄未儲存內容並關閉？');
    });
  }, []);
  const refresh = (snapshot: ProjectSnapshot) => {
    setProject((p) => (p ? { ...p, snapshot } : p));
    if (projectRef.current) projectRef.current = { ...projectRef.current, snapshot };
  };
  const commit = async (changes: ProjectChange[]) => {
    const p = projectRef.current;
    if (!p) return false;
    const r = await window.drama.commit(p.handle, changes);
    if (r.ok) {
      refresh(r.value);
      return true;
    }
    notify(r.error.message);
    return false;
  };
  const select = async (id: string | null) => {
    if (!(await flush.current())) return;
    flushers.current.delete('step');
    setSelected(id);
  };
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = () =>
    run(async () => {
      if (!(await flush.current())) return;
      handleResult(await window.drama.open(), (p) => {
        setProject(p);
        setSelected(null);
      });
    });
  const importAssets = () => {
    if (project)
      void run(async () => handleResult(await window.drama.importAssets(project.handle), refresh));
  };
  const changeScope = async (value: string) => {
    if (!(await flush.current())) return;
    flushers.current.delete('step');
    setSelected(null);
    const locale = project?.snapshot.localeVariants.find((v) => 'locale:' + v.id === value);
    setScope(
      locale
        ? { kind: 'locale', episodeId: locale.episodeId, localeId: locale.id }
        : value === 'project'
          ? { kind: 'project' }
          : { kind: 'episode', episodeId: value },
    );
  };
  const s = project?.snapshot;
  const tools = getTools(s?.toolCatalog);
  const completed = s
    ? s.template.steps.filter((t) => {
        const r = latestRevision(s, t.id, scope);
        return r && !r.stale && s.reviews.some((v) => v.approved && v.revisionIds.includes(r.id));
      }).length
    : 0;
  const edited = s ? s.template.steps.filter((t) => latestRevision(s, t.id, scope)).length : 0;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">幕</div>
          <div>
            <strong>幕作</strong>
            <span>AI DRAMA STUDIO</span>
          </div>
        </div>
        <div className="workspace-label">
          創作工作室 <span>LOCAL</span>
        </div>
        <nav className="main-nav">
          <button
            className={view === 'canvas' ? 'active' : ''}
            onClick={async () => {
              if (await flush.current()) setView('canvas');
            }}
          >
            <span>◈</span>製作畫布<small>01</small>
          </button>
          <button
            className={view === 'assets' ? 'active' : ''}
            onClick={async () => {
              if (await flush.current()) {
                setSelected(null);
                setView('assets');
              }
            }}
          >
            <span>▧</span>資產庫<small>{s?.assets.length ?? 0}</small>
          </button>
          <button
            className={view === 'tools' ? 'active' : ''}
            onClick={async () => {
              if (await flush.current()) {
                setSelected(null);
                setView('tools');
              }
            }}
          >
            <span>⌘</span>工具中心<small>{tools.length}</small>
          </button>
        </nav>
        <div className="nav-divider" />
        <div className="sidebar-heading">
          製作流程 <span>5 ACTS</span>
        </div>
        <nav className="act-nav">
          {s?.template.acts.map((a, i) => (
            <div key={a.id}>
              <button
                className="act-link"
                onClick={() => {
                  setView('canvas');
                  void select(a.stepIds[0]);
                }}
              >
                <span style={{ color: a.color }}>●</span>幕{labels[i]} · {a.title}
                <small>{a.stepIds.length}</small>
              </button>
              {list &&
                a.stepIds.map((id) => {
                  const step = s.template.steps.find((t) => t.id === id);
                  return step && !step.archived ? (
                    <button
                      className={'step-link ' + (selected === id ? 'active' : '')}
                      key={id}
                      onClick={() => {
                        setView('canvas');
                        void select(id);
                      }}
                    >
                      {step.key} {step.title}
                    </button>
                  ) : null;
                })}
            </div>
          )) ?? <p className="sidebar-note">建立專案後，五幕14步會在這裡展開。</p>}
        </nav>
        <button className="sidebar-small" onClick={() => setList(!list)}>
          {list ? '收合步驟清單' : '展開步驟清單'} <span>↕</span>
        </button>
        <div className="sidebar-bottom">
          <div className="local-indicator">
            <i />
            本機工作空間<span>v0.1</span>
          </div>
          <div className="profile">
            <div className="avatar">導</div>
            <div>
              <strong>我的製作工作室</strong>
              <small>創作，從這裡開始。</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            工作室 <span>/</span> <b>{s?.project.name ?? '歡迎來到幕作'}</b>
          </div>
          <div className="top-actions">
            <button
              onClick={() => {
                setName('');
                setModal('create');
              }}
            >
              ＋ 新專案
            </button>
            <button onClick={open}>開啟專案</button>
            {project && (
              <>
                <button
                  onClick={() =>
                    void run(async () => {
                      handleResult(await window.drama.backup(project.handle), () =>
                        notify('一致性備份已建立'),
                      );
                    })
                  }
                >
                  備份
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    void run(async () => {
                      if (await flush.current())
                        handleResult(await window.drama.exportProject(project.handle), (p) =>
                          notify('完整專案已匯出：' + p),
                        );
                    })
                  }
                >
                  匯出專案 ↗
                </button>
              </>
            )}
          </div>
        </header>
        {!project ? (
          <main className="welcome">
            <div className="welcome-orbit">
              <div>幕</div>
            </div>
            <span className="eyebrow">YOUR STORY. ONE WORKSPACE.</span>
            <h1>
              讓下一個故事，
              <br />
              <em>從這一幕開始。</em>
            </h1>
            <p>
              從第一個靈感到最後一格畫面。
              <br />
              五幕14步，把劇集創作的每個環節連在一起。
            </p>
            <div className="button-row">
              <button
                className="primary large"
                onClick={() => {
                  setName('');
                  setModal('create');
                }}
              >
                ＋ 建立第一個劇集
              </button>
              <button className="large" onClick={open}>
                開啟 .aidrama 專案
              </button>
            </div>
            <button
              className="text-button"
              onClick={() =>
                void run(async () => handleResult(await window.drama.importProject(), setProject))
              }
            >
              從完整專案備份匯入 ↗
            </button>
            {recent.length > 0 && (
              <section className="recent-projects">
                <h3>繼續創作</h3>
                {recent.map((r) => (
                  <button
                    key={r.path}
                    onClick={() =>
                      void run(async () =>
                        handleResult(await window.drama.openRecent(r.path), setProject),
                      )
                    }
                  >
                    <span>▤</span>
                    <strong>{r.name}</strong>
                    <small>本機專案</small>
                    <span>↗</span>
                  </button>
                ))}
              </section>
            )}
            <div className="welcome-foot">本機保存 · 可替換工具 · 多語製作</div>
          </main>
        ) : (
          <>
            <div className="project-header">
              <div>
                <span className="eyebrow">
                  {view === 'canvas'
                    ? 'PRODUCTION WORKSPACE'
                    : view === 'assets'
                      ? 'YOUR CREATIVE LIBRARY'
                      : 'TOOLS & CONNECTIONS'}
                </span>
                <h1>
                  {view === 'canvas'
                    ? '故事的每一幕，都在這裡。'
                    : view === 'assets'
                      ? '讓每個鏡頭，有跡可循。'
                      : '用合適的工具，完成創作。'}
                </h1>
                <p>
                  {view === 'canvas'
                    ? '把靈感、角色、鏡頭與聲音，編織成你的下一部作品。'
                    : view === 'assets'
                      ? '統一管理角色、場景、影片、音色與授權紀錄。'
                      : '隨時切換製作工具，保留每一次創作的成果。'}
                </p>
              </div>
              <div className="project-progress">
                <div
                  className="progress-ring"
                  style={{ '--progress': `${(completed / 14) * 100}%` } as React.CSSProperties}
                >
                  <strong>
                    {completed}
                    <small>/14</small>
                  </strong>
                </div>
                <div>
                  <strong>製作進度</strong>
                  <span>
                    {edited} 步已開始 · {s?.assets.length} 個資產
                  </span>
                  <small>人工審核後計入完成進度</small>
                </div>
              </div>
            </div>
            <div className="canvas-toolbar">
              <div className="toolbar-left">
                <span className="live-dot" />
                <strong>
                  {view === 'canvas'
                    ? '五幕 · 工業化製作流程'
                    : view === 'assets'
                      ? '專案資產庫'
                      : '生產工具目錄'}
                </strong>
                {view === 'canvas' && (
                  <select
                    aria-label="製作範圍"
                    value={
                      scope.kind === 'locale'
                        ? 'locale:' + scope.localeId
                        : scope.kind === 'project'
                          ? 'project'
                          : scope.episodeId
                    }
                    onChange={(e) => void changeScope(e.target.value)}
                  >
                    <option value="project">全劇專案</option>
                    {s?.localeVariants.map((v) => (
                      <option key={v.id} value={'locale:' + v.id}>
                        {v.tag} · {s.episodes.find((e) => e.id === v.episodeId)?.name ?? '全劇'}
                      </option>
                    ))}
                    {s?.episodes.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="toolbar-right">
                <input
                  className="search"
                  placeholder="搜尋步驟或工具…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button onClick={() => setModal('tools')}>管理工具</button>
                <button
                  onClick={() => {
                    setName('');
                    setModal('episodes');
                  }}
                >
                  集數
                </button>
                <button
                  onClick={() =>
                    void window.drama.backups(project.handle).then((r) =>
                      handleResult(r, (b) => {
                        setBackups(b);
                        setModal('backups');
                      }),
                    )
                  }
                >
                  歷史備份
                </button>
                <button
                  onClick={() => {
                    setName('');
                    setActId(s!.template.acts[0].id);
                    setModal('custom');
                  }}
                >
                  ＋ 新增節點
                </button>
              </div>
            </div>
            <main className="content-area">
              {view === 'canvas' && (
                <>
                  <div className="canvas-wrap">
                    <WorkflowCanvas
                      snapshot={s!}
                      scope={scope}
                      selected={selected}
                      onSelect={(id) => void select(id)}
                      onChange={(c) => void commit([c])}
                    />
                    {search && (
                      <div className="search-results">
                        {s!.template.steps
                          .filter((t) => t.title.includes(search) || t.key.includes(search))
                          .map((t) => (
                            <button
                              key={t.id}
                              onClick={() => {
                                void select(t.id);
                                setSearch('');
                              }}
                            >
                              {t.key} · {t.title}
                            </button>
                          ))}
                      </div>
                    )}
                    <div className="canvas-hint">拖曳移動畫布 · 滾輪縮放 · 點擊節點開始創作</div>
                  </div>
                  {selected && (
                    <StepWorkspace
                      key={selected + JSON.stringify(scope)}
                      snapshot={s!}
                      handle={project.handle}
                      stepId={selected}
                      scope={scope}
                      commit={commit}
                      onClose={() => void select(null)}
                      setFlush={(fn) => {
                        flushers.current.set('step', fn);
                      }}
                      notify={notify}
                      onImportAssets={importAssets}
                      onRefresh={refresh}
                    />
                  )}
                </>
              )}
              {view === 'assets' && (
                <div className="page-content">
                  <AssetLibrary
                    handle={project.handle}
                    assets={s!.assets}
                    onImport={importAssets}
                    setFlush={(fn) => {
                      flushers.current.set('assets', fn);
                    }}
                    onChange={(c) => commit([c])}
                    onRepair={(id) =>
                      void window.drama
                        .repair(project.handle, id)
                        .then((r) => handleResult(r, refresh))
                    }
                  />
                </div>
              )}
              {view === 'tools' && (
                <div className="page-content">
                  <div className="notice-banner">
                    <span>◌</span>
                    <div>
                      <strong>你的工具，由你決定。</strong>
                      <p>
                        第一期支援工作檔匯出與人工製作。第三方 API
                        尚未接入；工具能力與授權需要依官方文件確認。
                      </p>
                    </div>
                  </div>
                  <div className="tool-catalog">
                    {tools
                      .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
                      .map((t) => (
                        <div className="catalog-card" key={t.id}>
                          <div className="catalog-top">
                            <div className="tool-symbol">{t.name.slice(0, 1)}</div>
                            <span className="badge">{t.id === 'manual' ? '本機' : '待查證'}</span>
                          </div>
                          <h3>{t.name}</h3>
                          <p>{t.category} · 人工操作</p>
                          <div className="catalog-bottom">
                            <small>{t.steps.length} 個適用步驟</small>
                            {t.url && (
                              <button
                                className="text-button"
                                onClick={() => void window.drama.openExternal(t.url)}
                              >
                                官方網站 ↗
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </main>
            <footer className="statusbar">
              <span>
                <i />
                本機保存 · {s!.project.name}.aidrama
              </span>
              <span>
                資產 {s!.assets.length} · 修訂 {s!.revisions.length} · 流程 v{s!.template.version}
              </span>
            </footer>
          </>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast('')}>×</button>
        </div>
      )}
      {busy && <div className="busy-pill">◌ 正在處理…</div>}
      {modal && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true">
            <button className="icon-button modal-close" onClick={() => setModal(null)}>
              ×
            </button>
            <span className="eyebrow">AI DRAMA STUDIO</span>
            <h2>
              {modal === 'create'
                ? '開啟一個新的故事'
                : modal === 'custom'
                  ? '擴充你的製作流程'
                  : modal === 'episodes'
                    ? '分集管理'
                    : modal === 'tools'
                      ? '管理生產工具'
                      : '專案備份'}
            </h2>
            {modal === 'tools' ? (
              <ToolManager
                rows={s!.toolCatalog}
                onSave={(rows) =>
                  void commit([{ type: 'records', collection: 'toolCatalog', rows }])
                }
              />
            ) : modal === 'backups' ? (
              <>
                <p className="muted">恢復前會先備份目前資料，影音素材保持原樣。</p>
                {backups.map((b) => (
                  <div className="backup-row" key={b.id}>
                    <span>{new Date(b.createdAt).toLocaleString()}</span>
                    <button
                      onClick={() =>
                        void run(async () => {
                          if (!(await flush.current())) return;
                          if (!window.confirm('以這份備份恢復專案？目前內容將先建立安全備份。'))
                            return;
                          handleResult(await window.drama.restore(project!.handle, b.id), (v) => {
                            setSelected(null);
                            refresh(v);
                            setModal(null);
                          });
                        })
                      }
                    >
                      恢復
                    </button>
                  </div>
                ))}
                {!backups.length && (
                  <div className="empty-inline">尚無備份。使用上方「備份」建立第一份快照。</div>
                )}
                <label className="field">
                  <span>保留成功備份份數</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    defaultValue={s?.project.backupRetention}
                    onBlur={(e) =>
                      void commit([{ type: 'retention', count: Number(e.target.value) }])
                    }
                  />
                </label>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (modal === 'create')
                    void run(async () => {
                      if (!(await flush.current())) return;
                      handleResult(await window.drama.create(name), (p) => {
                        setProject(p);
                        setSelected(null);
                        setModal(null);
                      });
                    });
                  if (modal === 'custom') {
                    const result = applyTemplateEdit(s!.template, {
                      type: 'add',
                      actId,
                      title: name,
                      kind: customKind as 'text',
                    });
                    if (result.ok)
                      void commit([{ type: 'template', template: result.value }]).then((ok) => {
                        if (ok) setModal(null);
                      });
                  }
                  if (modal === 'episodes')
                    void commit([
                      {
                        type: 'records',
                        collection: 'episodes',
                        rows: [...s!.episodes, { id: uid(), name }],
                      },
                    ]).then((ok) => {
                      if (ok) setModal(null);
                    });
                }}
              >
                <p className="muted">
                  {modal === 'create'
                    ? '所有內容與素材會保存在你選擇的位置。'
                    : modal === 'custom'
                      ? '新增的工作節點會與標準14步一起保存。'
                      : '為每一集保留獨立的交付物與審核紀錄。'}
                </p>
                <label className="field">
                  <span>{modal === 'create' ? '劇集名稱' : '名稱'}</span>
                  <input
                    autoFocus
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={modal === 'create' ? '例如：月光下的第七封信' : '輸入名稱'}
                  />
                </label>
                {modal === 'custom' && (
                  <>
                    <label className="field">
                      <span>所屬幕次</span>
                      <select value={actId} onChange={(e) => setActId(e.target.value)}>
                        {s!.template.acts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>節點類型</span>
                      <select value={customKind} onChange={(e) => setCustomKind(e.target.value)}>
                        <option value="text">文字工作區</option>
                        <option value="table">結構化表格</option>
                        <option value="assets">資產清單</option>
                        <option value="checklist">檢查清單</option>
                      </select>
                    </label>
                  </>
                )}
                <button className="primary full-button" type="submit" disabled={busy}>
                  {modal === 'create' ? '選擇儲存位置並建立 ↗' : '新增'}
                </button>
              </form>
            )}
            {modal === 'custom' && (
              <details>
                <summary>管理現有節點</summary>
                <TemplateManager
                  template={s!.template}
                  onSave={(template) => void commit([{ type: 'template', template }])}
                />
                {s!.template.steps.map((t) => (
                  <div className="backup-row" key={t.id}>
                    <span>
                      {t.key} {t.title}
                    </span>
                    <button
                      onClick={() => {
                        const r = applyTemplateEdit(s!.template, {
                          type: t.archived ? 'restore' : 'archive',
                          stepId: t.id,
                        });
                        if (
                          r.ok &&
                          window.confirm(
                            t.archived
                              ? '恢復此節點？'
                              : '封存後不會刪除成果，但必要步驟仍需通過審核。確定封存？',
                          )
                        )
                          void commit([{ type: 'template', template: r.value }]);
                      }}
                    >
                      {t.archived ? '恢復' : '封存'}
                    </button>
                  </div>
                ))}
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
