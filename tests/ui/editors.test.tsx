// @vitest-environment jsdom
import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DataEditor } from '../../src/renderer/features/editors/DataEditor';
import { LocaleEditor } from '../../src/renderer/features/locales/LocaleEditor';
import { uid } from '../../src/shared/model';
afterEach(cleanup);
it('storyboard edits real typed fields and adds full rows', () => {
  const onChange = vi.fn();
  render(
    <DataEditor kind="05" content={{ kind: '05', fields: {}, rows: [] }} onChange={onChange} />,
  );
  fireEvent.change(screen.getByLabelText('集號'), { target: { value: 'E01' } });
  expect(onChange.mock.calls.at(-1)?.[0].fields.episode).toBe('E01');
  fireEvent.click(screen.getByRole('button', { name: /新增鏡頭/ }));
  expect(onChange.mock.calls.at(-1)?.[0].rows[0]).toHaveProperty('camera');
});
it('Arabic subtitle editor preserves direction and produces editable cues', () => {
  const onSave = vi.fn();
  render(
    <LocaleEditor
      episodeId="E01"
      variants={[
        { id: uid(), tag: 'ar', sourceId: null, episodeId: 'E01', terms: [], cues: [], notes: '' },
      ]}
      onSave={onSave}
      onExport={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText('新增字幕'));
  expect(onSave.mock.calls.at(-1)?.[0].cues).toHaveLength(1);
  expect(screen.getByTestId('subtitle-preview').getAttribute('dir')).toBe('rtl');
});
it('failed locale saves retain the latest draft and offer retry', async () => {
  let flush = async () => true;
  const save = vi.fn(async () => false);
  render(
    <LocaleEditor
      episodeId="E01"
      variants={[
        { id: uid(), tag: 'ar', sourceId: null, episodeId: 'E01', terms: [], cues: [], notes: '' },
      ]}
      setFlush={(fn) => {
        flush = fn;
      }}
      onSave={save}
      onExport={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('文化創譯紀錄'), {
    target: { value: '保留最後輸入 ABC' },
  });
  expect((screen.getByLabelText('文化創譯紀錄') as HTMLTextAreaElement).value).toBe(
    '保留最後輸入 ABC',
  );
  expect(await screen.findByText(/儲存失敗.*重試/)).toBeTruthy();
  expect(await flush()).toBe(false);
  save.mockResolvedValue(true);
  expect(await flush()).toBe(true);
});
it('failed asset metadata saves retain typed authorization evidence', async () => {
  const { AssetLibrary } = await import('../../src/renderer/features/assets/AssetLibrary');
  const asset = {
    id: uid(),
    revisionId: uid(),
    relativePath: 'media/a.txt',
    name: 'rights.txt',
    sha256: 'a',
    bytes: 1,
    mime: 'text/plain',
    kind: 'document' as const,
    createdAt: '',
    durationMs: null,
    status: 'unreviewed' as const,
    reason: '',
    rights: 'unreviewed' as const,
    licenseNote: '',
  };
  render(
    <AssetLibrary
      handle={uid()}
      assets={[asset]}
      onImport={vi.fn()}
      onChange={async () => false}
      onRepair={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /rights.txt/ }));
  fireEvent.change(screen.getByLabelText('授權來源與適用範圍'), {
    target: { value: '原創授權 ABC' },
  });
  expect((screen.getByLabelText('授權來源與適用範圍') as HTMLTextAreaElement).value).toBe(
    '原創授權 ABC',
  );
  expect(await screen.findByText(/儲存失敗.*重試/)).toBeTruthy();
});
