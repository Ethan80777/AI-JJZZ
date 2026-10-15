import { useDraftRecords, type FlushSetter } from '../editors/useDraftRecords';
import React, { useState } from 'react';
import type { Asset, ProjectChange } from '../../../shared/model';
export function AssetLibrary({
  handle,
  assets: persistedAssets,
  setFlush,
  onImport,
  onChange,
  onRepair,
}: {
  handle: string;
  assets: Asset[];
  setFlush?: FlushSetter;
  onImport: () => void;
  onChange: (c: ProjectChange) => Promise<boolean | void> | boolean | void;
  onRepair: (id: string) => void;
}) {
  const draft = useDraftRecords(
    persistedAssets,
    (a) =>
      onChange({
        type: 'asset',
        assetId: a.id,
        status: a.status,
        reason: a.reason,
        rights: a.rights,
        licenseNote: a.licenseNote,
      }),
    setFlush,
  );
  const assets = draft.rows;
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const asset = assets.find((a) => a.id === selected);
  const edit = (a: Asset, patch: Partial<Asset>) => draft.update({ ...a, ...patch });
  return (
    <section>
      {draft.failed && (
        <button className="warning" onClick={() => void draft.flush()}>
          儲存失敗，重試（輸入已保留）
        </button>
      )}
      {draft.saving && <p role="status">素材資訊儲存中…</p>}
      <div className="section-heading">
        <h3>
          製作資產 <small>{assets.length}</small>
        </h3>
        <button className="primary" onClick={onImport}>
          ＋ 匯入素材
        </button>
      </div>
      <div className="chips">
        {[
          ['all', '全部'],
          ['image', '圖像'],
          ['video', '影片'],
          ['audio', '聲音'],
          ['document', '文件'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? 'chip active' : 'chip'}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="asset-grid">
        {assets
          .filter((a) => filter === 'all' || a.kind === filter)
          .map((a) => (
            <button
              className={'asset-card ' + (a.id === selected ? 'selected' : '')}
              key={a.id}
              onClick={() => setSelected(a.id)}
            >
              <div className="asset-thumb">
                {a.kind === 'image' ? (
                  <img src={`drama://${handle}/${a.id}`} alt={a.name} />
                ) : (
                  <span>{a.kind === 'video' ? '▷' : a.kind === 'audio' ? '♫' : '▤'}</span>
                )}
                <small>{a.kind.toUpperCase()}</small>
              </div>
              <strong>{a.name}</strong>
              <span className="muted">
                {(a.bytes / 1024 / 1024).toFixed(2)} MB ·{' '}
                {a.status === 'accepted' ? '已選用' : a.status === 'rejected' ? '已退件' : '待審核'}
              </span>
            </button>
          ))}
      </div>
      {!assets.length && (
        <div className="empty-inline">
          把角色設定圖、場景、聲音與成片加入專案。素材會複製到專案資產庫。
        </div>
      )}
      {asset && (
        <div className="asset-detail">
          <h3>{asset.name}</h3>
          {asset.kind === 'video' && <video controls src={`drama://${handle}/${asset.id}`} />}
          {asset.kind === 'audio' && <audio controls src={`drama://${handle}/${asset.id}`} />}
          <div className="copy-id">
            <code>{asset.id}</code>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(asset.id).then(
                  () => setCopied(asset.id),
                  () => setCopied('無法複製，請選取上方ID'),
                )
              }
            >
              {copied === asset.id ? '已複製' : '複製ID'}
            </button>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>素材審核</span>
              <select
                value={asset.status}
                onChange={(e) => edit(asset, { status: e.target.value as Asset['status'] })}
              >
                <option value="unreviewed">待審核</option>
                <option value="accepted">已選用</option>
                <option value="rejected">退件（保留素材）</option>
              </select>
            </label>
            <label className="field">
              <span>權利狀態</span>
              <select
                value={asset.rights}
                onChange={(e) => edit(asset, { rights: e.target.value as Asset['rights'] })}
              >
                <option value="unreviewed">待確認</option>
                <option value="licensed">已取得授權</option>
                <option value="restricted">限制使用</option>
                <option value="expired">已到期</option>
              </select>
            </label>
            <label className="field wide">
              <span>授權來源與適用範圍</span>
              <textarea
                value={asset.licenseNote}
                onChange={(e) => edit(asset, { licenseNote: e.target.value })}
              />
            </label>
            <label className="field wide">
              <span>退件原因／品質備註</span>
              <textarea
                value={asset.reason}
                onChange={(e) => edit(asset, { reason: e.target.value })}
              />
            </label>
          </div>
          <button onClick={() => onRepair(asset.id)}>重新定位遺失素材</button>
          <p className="tiny">SHA-256 · {asset.sha256}</p>
        </div>
      )}
    </section>
  );
}
